/** Deepgram realtime websocket connection helpers. */
import { getDeepgramModelForLanguage, normalizeDeepgramLanguage } from '../../shared/languages';
import { APP_URLS, buildUrl } from '../../shared/constants';
import type { TranscriptLanguage } from '../../shared/types';

type DeepgramAuthProtocol = 'token' | 'bearer';

const DEEPGRAM_AUTH_PROTOCOLS: readonly DeepgramAuthProtocol[] = ['token', 'bearer'];
const DEEPGRAM_CONNECT_TIMEOUT_MS = 10_000;
const DEEPGRAM_CONNECT_STABILIZE_MS = 1_200;
const DEEPGRAM_KEEP_ALIVE_MS = 8_000;

/** Builds the Deepgram listen URL with transcript options for the selected language. */
function createDeepgramUrl(language: TranscriptLanguage): string {
  const normalizedLanguage = normalizeDeepgramLanguage(language);
  return buildUrl(APP_URLS.deepgramListen, {
    model: getDeepgramModelForLanguage(normalizedLanguage),
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    smart_format: 'true',
    interim_results: 'true',
    vad_events: 'true',
    punctuate: 'true',
    utterance_end_ms: '1000',
    language: normalizedLanguage
  });
}

/** Creates a Deepgram websocket with the requested auth protocol. */
function createDeepgramSocket(
  language: TranscriptLanguage,
  apiKey: string,
  protocol: DeepgramAuthProtocol = 'token'
): WebSocket {
  return new WebSocket(createDeepgramUrl(language), [protocol, apiKey]);
}

/** Connects to Deepgram, retrying supported authentication protocol names. */
export async function connectDeepgramSocket(language: TranscriptLanguage, apiKey: string): Promise<WebSocket> {
  let lastError: unknown = null;

  for (const protocol of DEEPGRAM_AUTH_PROTOCOLS) {
    const socket = createDeepgramSocket(language, apiKey, protocol);
    try {
      await waitForSocketReady(socket);
      return socket;
    } catch (error) {
      lastError = error;
      closeSocket(socket);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not connect to Deepgram.');
}

/** Sends periodic Deepgram KeepAlive messages while the socket remains open. */
export function startDeepgramKeepAlive(socket: WebSocket): number {
  return window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, DEEPGRAM_KEEP_ALIVE_MS);
}

/** Waits until a websocket has opened and remained stable long enough to use. */
function waitForSocketReady(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    let opened = false;
    const timeout = window.setTimeout(() => reject(new Error('Deepgram connection timeout.')), DEEPGRAM_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      opened = true;
      window.setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          window.clearTimeout(timeout);
          resolve();
        }
      }, DEEPGRAM_CONNECT_STABILIZE_MS);
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Could not connect to Deepgram.'));
    };
    socket.onclose = (event) => {
      if (opened) {
        window.clearTimeout(timeout);
        reject(new Error(`Deepgram rejected the connection (${event.code}).`));
      }
    };
  });
}

/** Closes a websocket only when it has not already finished closing. */
function closeSocket(socket: WebSocket): void {
  if (socket.readyState <= WebSocket.OPEN) {
    socket.close();
  }
}
