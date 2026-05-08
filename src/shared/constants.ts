/** Shared URL and extension path constants for ChromeTranscript. */
type HttpUrl = `http://${string}` | `https://${string}`;
type WebSocketUrl = `wss://${string}`;
type ExtensionFile = `${string}.${string}`;

type AppUrls = {
  developer: HttpUrl;
  source: HttpUrl;
  deepgramSignup: HttpUrl;
  deepgramProjects: HttpUrl;
  deepgramListen: WebSocketUrl;
};

type ExtensionPaths = {
  audioWorklet: ExtensionFile;
  offscreenDocument: ExtensionFile;
  sidePanel: ExtensionFile;
};

export const APP_URLS = {
  developer: 'https://www.bariskisir.com',
  source: 'https://github.com/bariskisir/ChromeTranscript',
  deepgramSignup: 'https://console.deepgram.com/signup',
  deepgramProjects: 'https://api.deepgram.com/v1/projects',
  deepgramListen: 'wss://api.deepgram.com/v1/listen'
} as const satisfies AppUrls;

export const EXTENSION_PATHS = {
  audioWorklet: 'audio-worklet.js',
  offscreenDocument: 'offscreen.html',
  sidePanel: 'sidepanel.html'
} as const satisfies ExtensionPaths;

type ExtensionPath = typeof EXTENSION_PATHS[keyof typeof EXTENSION_PATHS];

/** Resolves an extension-relative asset path into a Chrome runtime URL. */
export function getExtensionUrl(path: ExtensionPath): string {
  return chrome.runtime.getURL(path);
}

/** Builds a URL with encoded query parameters. */
export function buildUrl(baseUrl: HttpUrl | WebSocketUrl, params: Record<string, string>): string {
  return `${baseUrl}?${new URLSearchParams(params).toString()}`;
}

/** Builds the Deepgram balances endpoint for a project id. */
export function buildDeepgramBalancesUrl(projectId: string): string {
  return `${APP_URLS.deepgramProjects}/${encodeURIComponent(projectId)}/balances`;
}
