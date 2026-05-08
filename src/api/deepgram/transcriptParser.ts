/** Deepgram transcript event parsing helpers. */

/** Parses a websocket MessageEvent payload into a transcript, ignoring non-transcript events. */
export function parseDeepgramTranscriptEvent(data: unknown): { text: string; isFinal: boolean } | null {
  try {
    return extractDeepgramTranscript(JSON.parse(String(data)));
  } catch {
    return null;
  }
}

/** Extracts normalized transcript text from Deepgram realtime event payloads. */
function extractDeepgramTranscript(payload: unknown): { text: string; isFinal: boolean } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const channel = root.channel && typeof root.channel === 'object'
    ? root.channel as Record<string, unknown>
    : {};
  const alternatives = Array.isArray(channel.alternatives) ? channel.alternatives : [];
  const first = alternatives[0] && typeof alternatives[0] === 'object'
    ? alternatives[0] as Record<string, unknown>
    : {};
  const transcript = typeof first.transcript === 'string' ? first.transcript.trim() : '';
  if (!transcript) {
    return null;
  }

  return {
    text: transcript,
    isFinal: root.is_final === true || root.speech_final === true
  };
}
