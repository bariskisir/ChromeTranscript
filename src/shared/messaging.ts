/** Runtime message guards and dispatch helpers shared across extension contexts. */
import { isDeepgramLanguageCode } from './languages';
import type {
  ErrorResult,
  Result,
  RuntimeEventMessage,
  RuntimeRequest,
  StatusPayload
} from './types';

export interface RuntimeResponseByAction {
  'status.get': StatusPayload | ErrorResult;
  'sidepanel.open': Result;
  'settings.save': Result;
  'transcript.create': Result<{ transcriptId: string }>;
  'transcript.select': Result;
  'transcript.delete': Result<{ transcriptId: string }>;
  'transcript.append': Result;
  'capture.tab.start': Result;
  'capture.tab.stop': Result;
}

type RuntimeResponseFor<TRequest extends RuntimeRequest> = RuntimeResponseByAction[TRequest['action']];

/** Checks whether an unknown value is a supported runtime request. */
export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  const candidate = extractActionRecord(value);
  if (!candidate) {
    return false;
  }

  switch (candidate.action) {
    case 'status.get':
    case 'sidepanel.open':
    case 'capture.tab.stop':
    case 'transcript.create':
      return true;
    case 'settings.save':
      return candidate.language == null || isDeepgramLanguageCode(candidate.language);
    case 'transcript.select':
    case 'transcript.delete':
      return typeof candidate.transcriptId === 'string';
    case 'transcript.append':
      return typeof candidate.transcriptId === 'string' && typeof candidate.text === 'string';
    case 'capture.tab.start':
      return typeof candidate.transcriptId === 'string'
        && (candidate.language == null || isDeepgramLanguageCode(candidate.language));
    default:
      return false;
  }
}

/** Checks whether an unknown value is a supported runtime event message. */
export function isRuntimeEventMessage(value: unknown): value is RuntimeEventMessage {
  const candidate = extractActionRecord(value);
  if (!candidate) {
    return false;
  }

  switch (candidate.action) {
    case 'event.transcriptsChanged':
      return true;
    case 'status.render':
      return typeof candidate.status === 'string';
    case 'capture.state':
      return typeof candidate.running === 'boolean' && typeof candidate.transcriptId === 'string';
    case 'transcript.render':
      return typeof candidate.transcriptId === 'string'
        && typeof candidate.text === 'string'
        && typeof candidate.isFinal === 'boolean';
    default:
      return false;
  }
}

/** Sends a typed runtime request and returns its action-specific response shape. */
export async function sendRuntimeMessage<TRequest extends RuntimeRequest>(
  message: TRequest
): Promise<RuntimeResponseFor<TRequest>> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponseFor<TRequest>>;
}

/** Broadcasts a runtime event while ignoring listeners that are not available. */
export function broadcastRuntimeMessage(message: RuntimeEventMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** Extracts an action-bearing record from an unknown message payload. */
function extractActionRecord(value: unknown): (Record<string, unknown> & { action: string }) | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { action?: unknown };
  return typeof candidate.action === 'string'
    ? value as Record<string, unknown> & { action: string }
    : null;
}
