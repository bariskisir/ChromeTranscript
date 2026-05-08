/** Popup entry point for Deepgram setup, balance refresh, and side panel launch. */
import { APP_URLS, EXTENSION_PATHS } from '../../shared/constants';
import {
  connectDeepgramSocket,
  getDeepgramBalanceErrorMessage,
  getDeepgramStorage,
  refreshDeepgramBalance,
  saveDeepgramApiKey
} from '../../api/deepgram';
import { sendRuntimeMessage } from '../../shared/messaging';
import { requireButton, requireElement, requireInput } from '../../shared/domHelpers';

const appVersion = requireElement('appVersion');
const mainStatus = requireElement('mainStatus');
const headerLimits = requireElement('headerLimits');
const limitList = requireElement('limitList');
const deepgramStatus = requireElement('deepgramStatus');
const deepgramApiKeyInput = requireInput('deepgramApiKeyInput');
const testDeepgramButton = requireButton('testDeepgramButton');
const openSidePanelButton = requireButton('openSidePanelButton');
const deepgramSignupButton = requireButton('deepgramSignupButton');
const balanceRefreshButton = requireButton('balanceRefreshButton');
const developerLink = requireButton('developerLink');
const sourceLink = requireButton('sourceLink');

let savedDeepgramApiKey = '';
const BALANCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderVersion();
  void initializePopup();
  window.setInterval(() => {
    void refreshDeepgramBalanceForSavedKey({ silent: true });
  }, BALANCE_REFRESH_INTERVAL_MS);
});

/** Wires popup controls to Deepgram setup and navigation actions. */
function bindEvents(): void {
  deepgramApiKeyInput.addEventListener('input', () => {
    renderMainStatus('');
    if (deepgramApiKeyInput.value.trim() !== savedDeepgramApiKey) {
      renderDeepgramStatus('');
    }
    updateStartButtonState();
  });
  testDeepgramButton.addEventListener('click', () => {
    void testAndSaveDeepgramApiKey();
  });
  balanceRefreshButton.addEventListener('click', () => {
    void refreshDeepgramBalanceForSavedKey();
  });
  openSidePanelButton.addEventListener('click', () => {
    void openSidePanel();
  });
  deepgramSignupButton.addEventListener('click', () => {
    openExternal(APP_URLS.deepgramSignup);
  });
  developerLink.addEventListener('click', () => openExternal(APP_URLS.developer));
  sourceLink.addEventListener('click', () => openExternal(APP_URLS.source));
}

/** Renders the extension version from the installed manifest. */
function renderVersion(): void {
  const version = chrome.runtime.getManifest().version;
  appVersion.textContent = version ? `v${version}` : '';
}

/** Loads saved Deepgram state and initializes popup controls. */
async function initializePopup(): Promise<void> {
  const deepgram = await getDeepgramStorage();
  savedDeepgramApiKey = deepgram.apiKey || '';
  deepgramApiKeyInput.value = savedDeepgramApiKey;
  renderDeepgramBalance(deepgram.balanceLabel || '');
  renderDeepgramStatus(savedDeepgramApiKey
    ? ['API key saved locally.', deepgram.balanceLabel || ''].filter(Boolean).join(' ')
    : '');
  updateStartButtonState();
  if (savedDeepgramApiKey && isBalanceStale(deepgram.balanceUpdatedAt)) {
    void refreshDeepgramBalanceForSavedKey({ silent: true });
  }
}

/** Tests and saves the entered Deepgram API key, then refreshes balance metadata. */
async function testAndSaveDeepgramApiKey(): Promise<void> {
  const apiKey = deepgramApiKeyInput.value.trim();
  if (!apiKey) {
    renderDeepgramStatus('Enter a Deepgram API key first.', false);
    return;
  }

  setBusy(testDeepgramButton, true, 'Testing');
  renderDeepgramStatus('Testing Deepgram connection...');
  try {
    await testDeepgramConnection(apiKey);
    await saveDeepgramApiKey(apiKey);
    savedDeepgramApiKey = apiKey;
    updateStartButtonState();
    try {
      const balanceLabel = await refreshDeepgramBalance(apiKey);
      renderDeepgramBalance(balanceLabel);
      renderDeepgramStatus(`Deepgram API key works. Saved locally. ${balanceLabel}`);
    } catch (balanceError) {
      await saveDeepgramApiKey(apiKey, { clearBalance: true });
      renderDeepgramBalance('');
      renderDeepgramStatus(`Deepgram API key works. Saved locally. ${getDeepgramBalanceErrorMessage(balanceError)}`);
    }
  } catch (error) {
    renderDeepgramStatus(error instanceof Error ? error.message : 'Deepgram API key test failed.', false);
  } finally {
    setBusy(testDeepgramButton, false, 'Test & Save');
  }
}

/** Opens the side panel after verifying a saved Deepgram key is active. */
async function openSidePanel(): Promise<void> {
  if (!hasSavedDeepgramKey()) {
    renderMainStatus('Test & Save a Deepgram API key first.', false);
    return;
  }

  setBusy(openSidePanelButton, true, 'Opening');
  const sidePanelOpenTask = openSidePanelFromPopup();
  const bindTask = sendRuntimeMessage({ action: 'sidepanel.open' });
  window.setTimeout(() => window.close(), 0);

  try {
    const [result] = await Promise.all([bindTask, sidePanelOpenTask]);
    if (!result.ok) {
      renderMainStatus(result.error || 'Could not open side panel.', false);
    }
  } finally {
    setBusy(openSidePanelButton, false, 'Start');
    updateStartButtonState();
  }
}

/** Uses Chrome sidePanel APIs from the popup context with tab fallback behavior. */
async function openSidePanelFromPopup(): Promise<void> {
  if (!chrome.sidePanel?.open) {
    return;
  }

  try {
    await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  } catch {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return;
    }
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: EXTENSION_PATHS.sidePanel,
      enabled: true
    }).catch(() => undefined);
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }
}

/** Verifies that a Deepgram API key can open a realtime websocket. */
async function testDeepgramConnection(apiKey: string): Promise<void> {
  const socket = await connectDeepgramSocket('en-US', apiKey);
  socket.close(1000, 'Test complete');
}

/** Checks whether the input still matches the saved Deepgram key. */
function hasSavedDeepgramKey(): boolean {
  return Boolean(savedDeepgramApiKey && deepgramApiKeyInput.value.trim() === savedDeepgramApiKey);
}

/** Enables or disables launch controls based on saved key state. */
function updateStartButtonState(): void {
  const hasKey = hasSavedDeepgramKey();
  openSidePanelButton.disabled = !hasKey;
  headerLimits.hidden = !hasKey;
}

/** Renders the popup-level status line. */
function renderMainStatus(message: string, ok = true): void {
  mainStatus.textContent = message;
  mainStatus.hidden = !message;
  mainStatus.classList.toggle('error-text', !ok);
}

/** Renders Deepgram API key and balance status text. */
function renderDeepgramStatus(message: string, ok = true): void {
  deepgramStatus.textContent = message;
  deepgramStatus.classList.toggle('error-text', !ok);
}

/** Renders the current Deepgram balance label in the header. */
function renderDeepgramBalance(label: string): void {
  limitList.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'limit-item';
  row.textContent = label || 'No balance data yet.';
  limitList.appendChild(row);
}

/** Refreshes Deepgram balance data for the saved API key. */
async function refreshDeepgramBalanceForSavedKey(options: { silent?: boolean } = {}): Promise<void> {
  if (!savedDeepgramApiKey) {
    return;
  }

  setIconBusy(balanceRefreshButton, true);
  try {
    const balanceLabel = await refreshDeepgramBalance(savedDeepgramApiKey);
    renderDeepgramBalance(balanceLabel);
    if (!options.silent) {
      renderDeepgramStatus(`Deepgram balance refreshed. ${balanceLabel}`);
    }
  } catch (error) {
    renderDeepgramBalance('');
    if (!options.silent) {
      renderDeepgramStatus(getDeepgramBalanceErrorMessage(error), false);
    }
  } finally {
    setIconBusy(balanceRefreshButton, false);
  }
}

/** Checks whether cached Deepgram balance data is old enough to refresh. */
function isBalanceStale(updatedAt: number | undefined): boolean {
  return !updatedAt || Date.now() - updatedAt >= BALANCE_REFRESH_INTERVAL_MS;
}

/** Toggles a text button's busy state and visible label. */
function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.disabled = busy;
  button.textContent = label;
}

/** Toggles an icon button's busy state. */
function setIconBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
}

/** Opens an external URL in a new active browser tab. */
function openExternal(url: string): void {
  void chrome.tabs.create({ url, active: true });
}
