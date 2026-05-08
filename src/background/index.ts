/** Background service worker that coordinates runtime messages, side panel state, and tab audio capture. */
import { EXTENSION_PATHS, getExtensionUrl } from '../shared/constants';
import { toErrorResult } from '../shared/errors';
import { isRuntimeRequest, broadcastRuntimeMessage } from '../shared/messaging';
import { getStorage, setStorage } from '../shared/storage';
import { normalizeDeepgramLanguage } from '../shared/languages';
import { appendTranscriptSegment, createTranscript, deleteTranscript, getTranscriptStorage, selectTranscript } from '../features/transcripts';
import type {
  CaptureTabStartRequest,
  Result,
  RuntimeEventMessage,
  RuntimeRequest,
  StatusPayload,
  TranscriptLanguage
} from '../shared/types';

const OFFSCREEN_DOCUMENT_URL = getExtensionUrl(EXTENSION_PATHS.offscreenDocument);

interface OffscreenAudioRelayMessage {
  target: 'background-audio-relay';
  tabId: number;
  transcriptId: string;
  message: RuntimeEventMessage;
}

type RuntimeResponse = Result | Result<{ transcriptId: string }> | StatusPayload;

let activeTabId: number | null = null;
let activeCaptureTranscriptId = '';

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isOffscreenAudioRelayMessage(message)) {
    resolveAndRespond(handleOffscreenAudioRelay(message), sendResponse);
    return true;
  }

  if (!isRuntimeRequest(message)) {
    return false;
  }

  resolveAndRespond(dispatch(message, sender), sendResponse);
  return true;
});

/** Routes typed runtime requests to the matching background handler. */
async function dispatch(message: RuntimeRequest, sender: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  switch (message.action) {
    case 'status.get':
      return getStatus();
    case 'sidepanel.open':
      return openSidePanel(sender.tab);
    case 'settings.save':
      return saveSettings(message.language);
    case 'transcript.create': {
      const transcript = await createTranscript(await getSavedLanguage());
      broadcastRuntimeMessage({ action: 'event.transcriptsChanged' });
      return { ok: true, transcriptId: transcript.id };
    }
    case 'transcript.select':
      await selectTranscript(message.transcriptId);
      broadcastRuntimeMessage({ action: 'event.transcriptsChanged' });
      return { ok: true };
    case 'transcript.delete': {
      const transcript = await deleteTranscript(message.transcriptId, await getSavedLanguage());
      broadcastRuntimeMessage({ action: 'event.transcriptsChanged' });
      return { ok: true, transcriptId: transcript.id };
    }
    case 'transcript.append':
      await appendTranscriptSegment(message.transcriptId, message.text);
      broadcastRuntimeMessage({ action: 'event.transcriptsChanged' });
      return { ok: true };
    case 'capture.tab.start':
      return startTabAudioCapture(message, sender);
    case 'capture.tab.stop':
      return stopTabAudioCapture();
  }
}

/** Builds the full status payload consumed by popup and side panel UI. */
async function getStatus(): Promise<StatusPayload> {
  const [{ deepgram, settings }, transcriptStorage] = await Promise.all([
    getStorage(['deepgram', 'settings']),
    getTranscriptStorage()
  ]);
  const language = normalizeDeepgramLanguage(settings?.language);
  return {
    ok: true,
    settings: {
      language,
      activeTranscriptId: transcriptStorage.activeId
    },
    deepgram: {
      apiKeySaved: Boolean(deepgram?.apiKey),
      balanceLabel: typeof deepgram?.balanceLabel === 'string' ? deepgram.balanceLabel : ''
    },
    transcripts: transcriptStorage,
    capture: {
      running: Boolean(activeCaptureTranscriptId),
      transcriptId: activeCaptureTranscriptId
    }
  };
}

/** Opens and enables the extension side panel for the active tab. */
async function openSidePanel(tab?: chrome.tabs.Tab): Promise<Result> {
  const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!targetTab?.id) {
    throw new Error('No active tab was available.');
  }

  activeTabId = targetTab.id;
  if (chrome.sidePanel) {
    await chrome.sidePanel.setOptions({
      tabId: targetTab.id,
      path: EXTENSION_PATHS.sidePanel,
      enabled: true
    }).catch(() => undefined);
    await chrome.sidePanel.open({ tabId: targetTab.id }).catch(() => undefined);
  }

  return { ok: true };
}

/** Saves normalized transcript settings in Chrome local storage. */
async function saveSettings(language: TranscriptLanguage | undefined): Promise<Result> {
  const { settings = {} } = await getStorage('settings');
  await setStorage({
    settings: {
      ...settings,
      language: normalizeDeepgramLanguage(language)
    }
  });
  return { ok: true };
}

/** Starts offscreen tab audio capture and connects it to the requested transcript. */
async function startTabAudioCapture(
  message: CaptureTabStartRequest,
  sender: chrome.runtime.MessageSender
): Promise<Result> {
  if (activeCaptureTranscriptId) {
    await stopTabAudioCapture();
  }

  const targetTab = sender.tab || await getActiveTab();
  const tabId = targetTab?.id;
  if (!tabId) {
    throw new Error('No current tab was available for audio capture.');
  }
  activeTabId = tabId;

  const { deepgram } = await getStorage('deepgram');
  const apiKey = typeof deepgram?.apiKey === 'string' ? deepgram.apiKey.trim() : '';
  if (!apiKey) {
    throw new Error('Enter and save a Deepgram API key first.');
  }

  await ensureOffscreenAudioDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  if (!streamId) {
    throw new Error('Chrome did not return a tab audio stream id.');
  }

  const transcriptId = message.transcriptId;
  const result = await chrome.runtime.sendMessage({
    target: 'offscreen-audio',
    type: 'start-audio',
    streamId,
    tabId,
    transcriptId,
    apiKey,
    language: normalizeDeepgramLanguage(message.language)
  }) as Result;

  if (!result.ok) {
    throw new Error(result.error || 'Could not start tab audio.');
  }

  activeCaptureTranscriptId = transcriptId;
  broadcastRuntimeMessage({ action: 'capture.state', running: true, transcriptId });
  return { ok: true };
}

/** Stops any running tab audio capture and notifies open extension views. */
async function stopTabAudioCapture(): Promise<Result> {
  const transcriptId = activeCaptureTranscriptId;
  activeCaptureTranscriptId = '';

  if (await hasOffscreenAudioDocument()) {
    await chrome.runtime.sendMessage({
      target: 'offscreen-audio',
      type: 'stop-audio'
    }).catch(() => undefined);
  }

  broadcastRuntimeMessage({ action: 'capture.state', running: false, transcriptId });
  return { ok: true };
}

/** Persists final transcript text from the offscreen relay and rebroadcasts capture events. */
async function handleOffscreenAudioRelay(message: OffscreenAudioRelayMessage): Promise<Result> {
  if (message.message.action === 'transcript.render' && message.message.isFinal) {
    await appendTranscriptSegment(message.transcriptId, message.message.text);
  }
  if (message.message.action === 'capture.state' && !message.message.running) {
    activeCaptureTranscriptId = '';
  }
  broadcastRuntimeMessage(message.message);
  return { ok: true };
}

/** Checks whether an unknown message is an offscreen audio relay payload. */
function isOffscreenAudioRelayMessage(value: unknown): value is OffscreenAudioRelayMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OffscreenAudioRelayMessage>;
  return candidate.target === 'background-audio-relay'
    && typeof candidate.tabId === 'number'
    && typeof candidate.transcriptId === 'string'
    && isRelayMessage(candidate.message);
}

/** Checks whether a relay payload contains an event that can be broadcast to UI views. */
function isRelayMessage(value: unknown): value is RuntimeEventMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RuntimeEventMessage>;
  return candidate.action === 'status.render'
    || candidate.action === 'transcript.render'
    || candidate.action === 'capture.state';
}

/** Reads the saved transcript language with the project default as fallback. */
async function getSavedLanguage(): Promise<TranscriptLanguage> {
  const { settings } = await getStorage('settings');
  return normalizeDeepgramLanguage(settings?.language);
}

/** Resolves the tab currently associated with capture or the active browser tab. */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (activeTabId != null) {
    const tab = await chrome.tabs.get(activeTabId).catch(() => null);
    if (tab?.id) {
      return tab;
    }
  }

  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
  return tab?.id ? tab : null;
}

/** Creates the offscreen document that owns getUserMedia and audio worklet capture. */
async function ensureOffscreenAudioDocument(): Promise<void> {
  if (await hasOffscreenAudioDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: EXTENSION_PATHS.offscreenDocument,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Capture and play the current tab audio for ChromeTranscript.'
  });
}

/** Checks whether the extension offscreen audio document is already alive. */
async function hasOffscreenAudioDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_DOCUMENT_URL]
  });
  return contexts.length > 0;
}

/** Sends async handler results back through Chrome's callback-based message API. */
function resolveAndRespond(
  promise: Promise<RuntimeResponse>,
  sendResponse: (response?: RuntimeResponse) => void
): void {
  promise
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      console.error('[ChromeTranscript]', error);
      sendResponse(toErrorResult(error));
    });
}
