/** Offscreen document entry point that captures tab audio and relays Deepgram transcript events. */
import { connectDeepgramSocket, parseDeepgramTranscriptEvent, startDeepgramKeepAlive } from '../../api/deepgram';
import { EXTENSION_PATHS, getExtensionUrl } from '../../shared/constants';
import { getDeepgramLanguageLabel, normalizeDeepgramLanguage } from '../../shared/languages';
import { PcmStream } from '../../shared/audioUtils';
import type { RuntimeEventMessage, TranscriptLanguage } from '../../shared/types';

interface StartAudioMessage {
  target: 'offscreen-audio';
  type: 'start-audio';
  streamId: string;
  tabId: number;
  transcriptId: string;
  apiKey: string;
  language?: TranscriptLanguage;
}

interface StopAudioMessage {
  target: 'offscreen-audio';
  type: 'stop-audio';
}

type OffscreenAudioMessage = StartAudioMessage | StopAudioMessage;

let tabAudioStream: PcmStream | null = null;
let deepgramSocket: WebSocket | null = null;
let targetTabId: number | null = null;
let activeTranscriptId = '';
let keepAliveTimer: number | null = null;
let sentAudio = false;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenAudioMessage(message)) {
    return false;
  }

  if (message.type === 'stop-audio') {
    stopTabAudio();
    sendResponse({ ok: true });
    return false;
  }

  startTabAudio(message)
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not start tab audio.'
    }));
  return true;
});

/** Starts tab audio capture, streams PCM chunks to Deepgram, and relays transcripts. */
async function startTabAudio(message: StartAudioMessage): Promise<void> {
  stopTabAudio();
  targetTabId = message.tabId;
  activeTranscriptId = message.transcriptId;
  const language = normalizeDeepgramLanguage(message.language);

  try {
    deepgramSocket = await connectDeepgramSocket(language, message.apiKey);
    sendStatus(`Deepgram connected (${getDeepgramLanguageLabel(language)}).`);
    keepAliveTimer = startDeepgramKeepAlive(deepgramSocket);
    deepgramSocket.onmessage = (event) => {
      const transcript = parseDeepgramTranscriptEvent(event.data);
      if (transcript) {
        sendRelayMessage({
          action: 'transcript.render',
          transcriptId: activeTranscriptId,
          text: transcript.text,
          isFinal: transcript.isFinal
        });
      }
    };
    deepgramSocket.onerror = () => sendStatus('Deepgram connection error.', 'error');
    deepgramSocket.onclose = (event) => {
      if (targetTabId != null) {
        sendStatus(`Deepgram disconnected (${event.code}).`, event.code === 1000 ? 'status' : 'error');
        sendRelayMessage({ action: 'capture.state', running: false, transcriptId: activeTranscriptId });
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(createTabAudioConstraints(message.streamId));
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Current tab audio is not available.');
    }

    tabAudioStream = await PcmStream.start({
      stream,
      workletUrl: getExtensionUrl(EXTENSION_PATHS.audioWorklet),
      passthroughAudio: true,
      onTrackEnded: stopTabAudio,
      onAudioChunk: (chunk) => {
        if (deepgramSocket?.readyState === WebSocket.OPEN) {
          if (!sentAudio) {
            sentAudio = true;
            sendStatus('Tab audio streaming to Deepgram.');
          }
          deepgramSocket.send(chunk);
        }
      }
    });
  } catch (error) {
    stopTabAudio();
    throw error;
  }
}

/** Stops capture resources, closes Deepgram, and notifies the background relay. */
function stopTabAudio(): void {
  const transcriptId = activeTranscriptId;
  const tabId = targetTabId;
  tabAudioStream?.stop();
  if (keepAliveTimer != null) {
    window.clearInterval(keepAliveTimer);
  }

  tabAudioStream = null;
  targetTabId = null;
  activeTranscriptId = '';
  keepAliveTimer = null;
  sentAudio = false;
  if (deepgramSocket && deepgramSocket.readyState <= WebSocket.OPEN) {
    deepgramSocket.close(1000, 'Stopped');
  }
  deepgramSocket = null;
  if (tabId != null && transcriptId) {
    sendRelayMessageFor(tabId, transcriptId, { action: 'capture.state', running: false, transcriptId });
  }
}

/** Builds Chrome tabCapture media constraints from a generated stream id. */
function createTabAudioConstraints(streamId: string): MediaStreamConstraints {
  return {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  } as unknown as MediaStreamConstraints;
}

/** Checks whether an unknown runtime message is intended for the offscreen audio document. */
function isOffscreenAudioMessage(value: unknown): value is OffscreenAudioMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OffscreenAudioMessage>;
  return candidate.target === 'offscreen-audio'
    && (
      candidate.type === 'stop-audio'
      || (
        candidate.type === 'start-audio'
        && typeof candidate.streamId === 'string'
        && typeof candidate.tabId === 'number'
        && typeof candidate.transcriptId === 'string'
        && typeof candidate.apiKey === 'string'
      )
    );
}

/** Sends a status event through the background relay. */
function sendStatus(status: string, tone: 'status' | 'error' = 'status'): void {
  sendRelayMessage({ action: 'status.render', status, tone });
}

/** Sends an event for the current tab and transcript when capture is active. */
function sendRelayMessage(message: RuntimeEventMessage): void {
  if (targetTabId == null || !activeTranscriptId) {
    return;
  }

  sendRelayMessageFor(targetTabId, activeTranscriptId, message);
}

/** Sends an event to the background relay for a specific tab and transcript. */
function sendRelayMessageFor(tabId: number, transcriptId: string, message: RuntimeEventMessage): void {
  void chrome.runtime.sendMessage({
    target: 'background-audio-relay',
    tabId,
    transcriptId,
    message
  }).catch(() => undefined);
}
