/** Shared TypeScript contracts for extension storage, runtime requests, and runtime events. */
import type { DeepgramLanguageCode } from './languages';

export type TranscriptLanguage = DeepgramLanguageCode;

export interface DeepgramStorage {
  apiKey?: string;
  balanceLabel?: string;
  balanceUpdatedAt?: number;
}

export interface TranscriptSettings {
  language?: TranscriptLanguage;
  activeTranscriptId?: string;
}

export interface TranscriptSegment {
  text: string;
  createdAt: number;
}

export interface TranscriptRecord {
  id: string;
  language: TranscriptLanguage;
  createdAt: number;
  updatedAt: number;
  segments: TranscriptSegment[];
}

export interface TranscriptStorage {
  activeId?: string;
  items?: TranscriptRecord[];
}

export interface ExtensionStorage {
  deepgram?: DeepgramStorage;
  settings?: TranscriptSettings;
  transcripts?: TranscriptStorage;
}

export interface OkResult {
  ok: true;
}

export interface ErrorResult {
  ok: false;
  error: string;
}

export type Result<T extends object = Record<never, never>> = (OkResult & T) | ErrorResult;

export interface StatusPayload {
  ok: true;
  settings: {
    language: TranscriptLanguage;
    activeTranscriptId: string;
  };
  deepgram: {
    apiKeySaved: boolean;
    balanceLabel: string;
  };
  transcripts: {
    activeId: string;
    items: TranscriptRecord[];
  };
  capture: {
    running: boolean;
    transcriptId: string;
  };
}

export interface StatusGetRequest {
  action: 'status.get';
}

export interface OpenSidePanelRequest {
  action: 'sidepanel.open';
}

export interface SaveSettingsRequest {
  action: 'settings.save';
  language?: TranscriptLanguage;
}

export interface CreateTranscriptRequest {
  action: 'transcript.create';
}

export interface SelectTranscriptRequest {
  action: 'transcript.select';
  transcriptId: string;
}

export interface DeleteTranscriptRequest {
  action: 'transcript.delete';
  transcriptId: string;
}

export interface AppendTranscriptRequest {
  action: 'transcript.append';
  transcriptId: string;
  text: string;
}

export interface CaptureTabStartRequest {
  action: 'capture.tab.start';
  language?: TranscriptLanguage;
  transcriptId: string;
}

export interface CaptureTabStopRequest {
  action: 'capture.tab.stop';
}

export type RuntimeRequest =
  | StatusGetRequest
  | OpenSidePanelRequest
  | SaveSettingsRequest
  | CreateTranscriptRequest
  | SelectTranscriptRequest
  | DeleteTranscriptRequest
  | AppendTranscriptRequest
  | CaptureTabStartRequest
  | CaptureTabStopRequest;

export interface TranscriptRenderMessage {
  action: 'transcript.render';
  transcriptId: string;
  text: string;
  isFinal: boolean;
}

export interface StatusRenderMessage {
  action: 'status.render';
  status: string;
  tone?: 'status' | 'error';
}

export interface CaptureStateMessage {
  action: 'capture.state';
  running: boolean;
  transcriptId: string;
}

export interface TranscriptsChangedMessage {
  action: 'event.transcriptsChanged';
}

export type RuntimeEventMessage =
  | TranscriptRenderMessage
  | StatusRenderMessage
  | CaptureStateMessage
  | TranscriptsChangedMessage;
