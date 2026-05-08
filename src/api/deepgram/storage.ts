/** Deepgram credential and balance persistence helpers. */
import { getStorage, removeStorage, setStorage } from '../../shared/storage';
import type { DeepgramStorage } from '../../shared/types';

interface SaveDeepgramApiKeyOptions {
  clearBalance?: boolean;
}

/** Reads normalized Deepgram credentials and balance metadata from storage. */
export async function getDeepgramStorage(): Promise<DeepgramStorage> {
  const { deepgram } = await getStorage('deepgram');
  return normalizeDeepgramStorage(deepgram);
}

/** Saves a Deepgram API key and clears stale balance data when the key changes. */
export async function saveDeepgramApiKey(
  apiKey: string,
  options: SaveDeepgramApiKeyOptions = {}
): Promise<DeepgramStorage> {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    await removeStorage('deepgram');
    return {};
  }

  const current = await getDeepgramStorage();
  const shouldClearBalance = options.clearBalance === true
    || Boolean(current.apiKey && current.apiKey !== normalizedApiKey);
  const nextStorage: DeepgramStorage = shouldClearBalance
    ? { apiKey: normalizedApiKey }
    : { ...current, apiKey: normalizedApiKey };

  await setStorage({ deepgram: nextStorage });
  return nextStorage;
}

/** Saves the latest balance label while preserving the current API key. */
export async function saveDeepgramBalance(apiKey: string, balanceLabel: string): Promise<DeepgramStorage> {
  const normalizedApiKey = apiKey.trim();
  const current = await getDeepgramStorage();
  const nextStorage: DeepgramStorage = {
    ...(current.apiKey === normalizedApiKey ? current : {}),
    balanceLabel,
    balanceUpdatedAt: Date.now()
  };
  const storedApiKey = normalizedApiKey || current.apiKey;
  if (storedApiKey) {
    nextStorage.apiKey = storedApiKey;
  }

  await setStorage({ deepgram: nextStorage });
  return nextStorage;
}

/** Normalizes unknown Deepgram storage payloads into the supported shape. */
function normalizeDeepgramStorage(value: unknown): DeepgramStorage {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as DeepgramStorage;
  const normalized: DeepgramStorage = {};
  if (typeof candidate.apiKey === 'string' && candidate.apiKey.trim()) {
    normalized.apiKey = candidate.apiKey.trim();
  }
  if (typeof candidate.balanceLabel === 'string' && candidate.balanceLabel.trim()) {
    normalized.balanceLabel = candidate.balanceLabel;
  }
  if (typeof candidate.balanceUpdatedAt === 'number' && Number.isFinite(candidate.balanceUpdatedAt)) {
    normalized.balanceUpdatedAt = candidate.balanceUpdatedAt;
  }
  return normalized;
}
