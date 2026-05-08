/** Side panel entry point for live capture controls and transcript navigation. */
import { DEEPGRAM_LANGUAGE_OPTIONS, normalizeDeepgramLanguage } from '../../shared/languages';
import { isRuntimeEventMessage, sendRuntimeMessage } from '../../shared/messaging';
import type { StatusPayload, TranscriptLanguage, TranscriptRecord } from '../../shared/types';
import { requireButton, requireElement, requireSelect } from '../../shared/domHelpers';

interface SidePanelState {
  transcripts: TranscriptRecord[];
  activeId: string;
  language: TranscriptLanguage;
  running: boolean;
  runningTranscriptId: string;
  interimText: string;
  apiKeySaved: boolean;
}

const statusRow = requireElement('statusText').parentElement as HTMLElement;
const statusText = requireElement('statusText');
const languageSelect = requireSelect('languageSelect');
const startButton = requireButton('startButton');
const stopButton = requireButton('stopButton');
const previousButton = requireButton('previousButton');
const nextButton = requireButton('nextButton');
const newButton = requireButton('newButton');
const copyButton = requireButton('copyButton');
const deleteButton = requireButton('deleteButton');
const transcriptCounter = requireElement('transcriptCounter');
const transcriptText = requireElement('transcriptText');

const state: SidePanelState = {
  transcripts: [],
  activeId: '',
  language: 'tr',
  running: false,
  runningTranscriptId: '',
  interimText: '',
  apiKeySaved: false
};

document.addEventListener('DOMContentLoaded', () => {
  populateLanguageOptions();
  bindEvents();
  void refreshState();
});

chrome.runtime.onMessage.addListener((incoming: unknown) => {
  if (!isRuntimeEventMessage(incoming)) {
    return false;
  }

  if (incoming.action === 'status.render') {
    renderStatus(incoming.status, incoming.tone);
    return false;
  }

  if (incoming.action === 'capture.state') {
    state.running = incoming.running;
    state.runningTranscriptId = incoming.running ? incoming.transcriptId : '';
    if (!incoming.running) {
      state.interimText = '';
    }
    renderTranscript();
    updateButtons();
    return false;
  }

  if (incoming.action === 'transcript.render') {
    if (incoming.transcriptId !== state.activeId) {
      return false;
    }
    if (incoming.isFinal) {
      appendFinalTranscriptText(incoming.text);
      state.interimText = '';
    } else {
      state.interimText = incoming.text.trim();
    }
    renderTranscript();
    return false;
  }

  if (incoming.action === 'event.transcriptsChanged') {
    void refreshState();
  }

  return false;
});

/** Wires side panel controls to transcript and capture actions. */
function bindEvents(): void {
  languageSelect.addEventListener('change', () => {
    state.language = normalizeDeepgramLanguage(languageSelect.value);
    void sendRuntimeMessage({ action: 'settings.save', language: state.language });
  });
  startButton.addEventListener('click', () => {
    void startCapture();
  });
  stopButton.addEventListener('click', () => {
    void stopCapture();
  });
  previousButton.addEventListener('click', () => {
    void selectTranscriptByOffset(-1);
  });
  nextButton.addEventListener('click', () => {
    void selectTranscriptByOffset(1);
  });
  newButton.addEventListener('click', () => {
    void createTranscript();
  });
  copyButton.addEventListener('click', () => {
    void copyActiveTranscript();
  });
  deleteButton.addEventListener('click', () => {
    void deleteActiveTranscript();
  });
}

/** Refreshes the side panel state from the background service worker. */
async function refreshState(): Promise<void> {
  const status = await sendRuntimeMessage({ action: 'status.get' });
  if (!status.ok) {
    renderStatus(status.error || 'Could not load transcripts.', 'error');
    return;
  }

  applyStatus(status);
  renderAll();
}

/** Applies a background status payload to local side panel state. */
function applyStatus(status: StatusPayload): void {
  state.transcripts = status.transcripts.items;
  state.activeId = status.transcripts.activeId;
  state.language = normalizeDeepgramLanguage(status.settings.language);
  state.running = status.capture.running;
  state.runningTranscriptId = status.capture.transcriptId;
  state.apiKeySaved = status.deepgram.apiKeySaved;
  languageSelect.value = state.language;
}

/** Starts tab audio capture for the active transcript. */
async function startCapture(): Promise<void> {
  if (!state.apiKeySaved) {
    renderStatus('Save a Deepgram API key from the popup first.', 'error');
    return;
  }
  if (!state.activeId) {
    renderStatus('Create a transcript first.', 'error');
    return;
  }

  startButton.disabled = true;
  renderStatus('Starting tab audio...');
  const result = await sendRuntimeMessage({
    action: 'capture.tab.start',
    transcriptId: state.activeId,
    language: state.language
  });
  if (!result.ok) {
    state.running = false;
    state.runningTranscriptId = '';
    renderStatus(result.error || 'Could not start tab audio.', 'error');
  } else {
    state.running = true;
    state.runningTranscriptId = state.activeId;
    renderStatus('Listening to current tab audio.');
  }
  updateButtons();
}

/** Stops the current tab audio capture session. */
async function stopCapture(): Promise<void> {
  stopButton.disabled = true;
  const result = await sendRuntimeMessage({ action: 'capture.tab.stop' });
  state.running = false;
  state.runningTranscriptId = '';
  state.interimText = '';
  if (!result.ok) {
    renderStatus(result.error || 'Could not stop tab audio.', 'error');
  } else {
    renderStatus('Stopped.');
  }
  renderTranscript();
  updateButtons();
}

/** Creates a new transcript and switches the panel to it. */
async function createTranscript(): Promise<void> {
  if (state.running) {
    return;
  }
  const result = await sendRuntimeMessage({ action: 'transcript.create' });
  if (!result.ok) {
    renderStatus(result.error || 'Could not create transcript.', 'error');
    return;
  }
  state.activeId = result.transcriptId;
  await refreshState();
}

/** Deletes the active transcript when deletion is allowed. */
async function deleteActiveTranscript(): Promise<void> {
  if (state.running || !canDeleteActiveTranscript()) {
    return;
  }

  const result = await sendRuntimeMessage({ action: 'transcript.delete', transcriptId: state.activeId });
  if (!result.ok) {
    renderStatus(result.error || 'Could not delete transcript.', 'error');
    return;
  }
  state.activeId = result.transcriptId;
  state.interimText = '';
  await refreshState();
}

/** Copies the active transcript text to the clipboard. */
async function copyActiveTranscript(): Promise<void> {
  const text = getActiveTranscriptText();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    renderStatus('Transcript copied.');
  } catch {
    renderStatus('Could not copy transcript.', 'error');
  }
}

/** Selects a neighboring transcript by relative offset. */
async function selectTranscriptByOffset(offset: number): Promise<void> {
  if (state.running) {
    return;
  }

  const currentIndex = getActiveTranscriptIndex();
  const next = state.transcripts[currentIndex + offset];
  if (!next) {
    return;
  }

  const result = await sendRuntimeMessage({ action: 'transcript.select', transcriptId: next.id });
  if (!result.ok) {
    renderStatus(result.error || 'Could not select transcript.', 'error');
    return;
  }
  state.activeId = next.id;
  state.interimText = '';
  await refreshState();
}

/** Renders all transcript UI fragments that depend on state. */
function renderAll(): void {
  renderTranscriptHeader();
  renderTranscript();
  updateButtons();
}

/** Renders the transcript position counter. */
function renderTranscriptHeader(): void {
  const active = getActiveTranscript();
  const activeIndex = getActiveTranscriptIndex();
  transcriptCounter.textContent = active
    ? `${activeIndex + 1}/${state.transcripts.length}`
    : '0/0';
}

/** Renders saved and interim transcript text for the active transcript. */
function renderTranscript(): void {
  const active = getActiveTranscript();
  transcriptText.innerHTML = '';

  const textParts = (active?.segments || [])
    .map((segment) => segment.text.trim())
    .filter(Boolean);
  const interimText = state.activeId === state.runningTranscriptId ? state.interimText.trim() : '';
  if (interimText) {
    textParts.push(interimText);
  }

  if (textParts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ct-empty';
    empty.textContent = 'No transcript yet.';
    transcriptText.appendChild(empty);
    return;
  }

  transcriptText.textContent = textParts.join(' ');
  transcriptText.scrollTop = transcriptText.scrollHeight;
}

/** Optimistically appends final transcript text to local state. */
function appendFinalTranscriptText(text: string): void {
  const active = getActiveTranscript();
  const normalizedText = text.trim();
  if (!active || !normalizedText) {
    return;
  }

  active.segments = active.segments.concat({
    text: normalizedText,
    createdAt: Date.now()
  });
  active.updatedAt = Date.now();
}

/** Updates button visibility and disabled states for the current workflow. */
function updateButtons(): void {
  const activeIndex = getActiveTranscriptIndex();
  const hasActive = Boolean(getActiveTranscript());
  const navigationDisabled = state.running;

  startButton.hidden = state.running;
  stopButton.hidden = !state.running;
  startButton.disabled = state.running || !state.apiKeySaved || !hasActive;
  stopButton.disabled = !state.running;
  languageSelect.disabled = state.running;
  previousButton.disabled = navigationDisabled || activeIndex <= 0;
  nextButton.disabled = navigationDisabled || activeIndex < 0 || activeIndex >= state.transcripts.length - 1;
  newButton.disabled = navigationDisabled;
  copyButton.disabled = !getActiveTranscriptText();
  deleteButton.disabled = navigationDisabled || !canDeleteActiveTranscript();
}

/** Renders the side panel status row. */
function renderStatus(status: string, tone: 'status' | 'error' = 'status'): void {
  statusText.textContent = status;
  statusRow.classList.toggle('is-error', tone === 'error');
}

/** Populates the language select from supported Deepgram language options. */
function populateLanguageOptions(): void {
  languageSelect.innerHTML = '';
  for (const option of DEEPGRAM_LANGUAGE_OPTIONS) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    languageSelect.appendChild(element);
  }
}

/** Returns the active transcript record when one is selected. */
function getActiveTranscript(): TranscriptRecord | null {
  return state.transcripts.find((item) => item.id === state.activeId) || null;
}

/** Returns the index of the active transcript in local state. */
function getActiveTranscriptIndex(): number {
  return state.transcripts.findIndex((item) => item.id === state.activeId);
}

/** Checks whether the active transcript can be deleted. */
function canDeleteActiveTranscript(): boolean {
  const active = getActiveTranscript();
  if (!active) {
    return false;
  }

  return state.transcripts.length > 1 || active.segments.length > 0;
}

/** Joins final and interim transcript text for copy and button state checks. */
function getActiveTranscriptText(): string {
  const active = getActiveTranscript();
  const textParts = (active?.segments || [])
    .map((segment) => segment.text.trim())
    .filter(Boolean);
  const interimText = state.activeId === state.runningTranscriptId ? state.interimText.trim() : '';
  if (interimText) {
    textParts.push(interimText);
  }
  return textParts.join(' ').trim();
}


