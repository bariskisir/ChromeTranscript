/** Deepgram management API helpers for fetching and formatting account balance data. */
import { APP_URLS, buildDeepgramBalancesUrl } from '../../shared/constants';
import { saveDeepgramBalance } from './storage';

interface DeepgramProject {
  project_id?: string;
}

interface DeepgramProjectsResponse {
  projects?: DeepgramProject[];
}

interface DeepgramBalancesResponse {
  balances?: Array<{ amount?: number; units?: string }>;
}

/** Fetches the first Deepgram project's balances and stores a display label. */
export async function refreshDeepgramBalance(apiKey: string): Promise<string> {
  const projectsResponse = await fetch(APP_URLS.deepgramProjects, {
    headers: createDeepgramHeaders(apiKey)
  });
  if (!projectsResponse.ok) {
    throw new Error(createDeepgramHttpErrorMessage('projects', projectsResponse.status));
  }

  const projectsPayload = await projectsResponse.json() as DeepgramProjectsResponse;
  const projectId = projectsPayload.projects?.[0]?.project_id || '';
  if (!projectId) {
    throw new Error('Deepgram returned no project for this API key.');
  }

  const balancesResponse = await fetch(buildDeepgramBalancesUrl(projectId), {
    headers: createDeepgramHeaders(apiKey)
  });
  if (!balancesResponse.ok) {
    throw new Error(createDeepgramHttpErrorMessage('balance', balancesResponse.status));
  }

  const balancesPayload = await balancesResponse.json() as DeepgramBalancesResponse;
  const balances = Array.isArray(balancesPayload.balances) ? balancesPayload.balances : [];
  const balanceLabel = `Deepgram: ${formatDeepgramBalances(balances)}`;
  await saveDeepgramBalance(apiKey, balanceLabel);
  return balanceLabel;
}

/** Converts balance refresh failures into a popup-friendly status message. */
export function getDeepgramBalanceErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return message || 'Deepgram balance could not be loaded.';
}

/** Creates authenticated headers for Deepgram management API requests. */
function createDeepgramHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Token ${apiKey}`,
    Accept: 'application/json'
  };
}

/** Creates permission-aware Deepgram management API error messages. */
function createDeepgramHttpErrorMessage(kind: 'projects' | 'balance', status: number): string {
  if (status === 401) {
    return 'Deepgram rejected this API key for management API requests.';
  }
  if (status === 403) {
    return kind === 'balance'
      ? 'Deepgram balance is hidden because this API key has no billing:read permission.'
      : 'Deepgram project data is hidden because this API key has no project:read permission.';
  }
  return `Could not fetch Deepgram ${kind} (${status}).`;
}

/** Formats Deepgram balance entries by summing amounts per unit. */
function formatDeepgramBalances(balances: Array<{ amount?: number; units?: string }>): string {
  if (balances.length === 0) {
    return 'no balance data';
  }

  const totals = new Map<string, number>();
  for (const balance of balances) {
    const amount = typeof balance.amount === 'number' && Number.isFinite(balance.amount) ? balance.amount : 0;
    const units = String(balance.units || '').trim().toUpperCase() || 'UNITS';
    totals.set(units, (totals.get(units) || 0) + amount);
  }

  return Array.from(totals.entries())
    .map(([units, amount]) => units === 'USD' ? `$${amount.toFixed(2)}` : `${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)} ${units}`)
    .join(', ');
}
