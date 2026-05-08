/** Transcript storage helpers that create, select, delete, and normalize transcript records. */
import { normalizeDeepgramLanguage } from '../../shared/languages';
import { DEFAULT_LANGUAGE } from '../../shared/settings';
import { getStorage, setStorage } from '../../shared/storage';
import type { TranscriptLanguage, TranscriptRecord, TranscriptSegment, TranscriptStorage } from '../../shared/types';

/** Reads transcript storage, repairing missing active records and seeding the first transcript. */
export async function getTranscriptStorage(): Promise<Required<TranscriptStorage>> {
  const { transcripts, settings } = await getStorage(['transcripts', 'settings']);
  const items = normalizeTranscriptRecords(transcripts?.items);
  const requestedActiveId = transcripts?.activeId || settings?.activeTranscriptId || '';
  let activeId = items.some((item) => item.id === requestedActiveId) ? requestedActiveId : items[0]?.id || '';

  if (items.length === 0) {
    const firstTranscript = createTranscriptRecord(normalizeDeepgramLanguage(settings?.language));
    items.push(firstTranscript);
    activeId = firstTranscript.id;
    await persistTranscriptStorage({ activeId, items });
  } else if (activeId !== transcripts?.activeId) {
    await persistTranscriptStorage({ activeId, items });
  }

  return { activeId, items };
}

/** Creates a new transcript and makes it the active transcript. */
export async function createTranscript(language?: TranscriptLanguage): Promise<TranscriptRecord> {
  const current = await getTranscriptStorage();
  const transcript = createTranscriptRecord(language);
  const items = current.items.concat(transcript);
  await persistTranscriptStorage({ activeId: transcript.id, items });
  return transcript;
}

/** Selects a transcript when it exists, preserving the current active transcript otherwise. */
export async function selectTranscript(transcriptId: string): Promise<void> {
  const current = await getTranscriptStorage();
  const activeId = current.items.some((item) => item.id === transcriptId)
    ? transcriptId
    : current.activeId;
  await persistTranscriptStorage({ activeId, items: current.items });
}

/** Deletes a transcript and returns the replacement active transcript. */
export async function deleteTranscript(transcriptId: string, language?: TranscriptLanguage): Promise<TranscriptRecord> {
  const current = await getTranscriptStorage();
  const targetIndex = current.items.findIndex((item) => item.id === transcriptId);
  const target = current.items[targetIndex];
  if (!target) {
    return current.items.find((item) => item.id === current.activeId) || current.items[0] || createTranscriptRecord(language);
  }

  if (current.items.length === 1) {
    if (target.segments.length === 0) {
      return target;
    }

    const replacement = createTranscriptRecord(language || target.language);
    await persistTranscriptStorage({ activeId: replacement.id, items: [replacement] });
    return replacement;
  }

  const items = current.items.filter((item) => item.id !== transcriptId);
  const fallbackIndex = Math.max(0, Math.min(targetIndex, items.length - 1));
  const activeId = current.activeId === transcriptId
    ? items[fallbackIndex]?.id || items[0]?.id || ''
    : current.activeId;
  await persistTranscriptStorage({ activeId, items });
  return items.find((item) => item.id === activeId) || items[0] || createTranscriptRecord(language);
}

/** Appends a final transcript segment to the requested transcript. */
export async function appendTranscriptSegment(transcriptId: string, text: string): Promise<void> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  const current = await getTranscriptStorage();
  const now = Date.now();
  const items = current.items.map((item) => {
    if (item.id !== transcriptId) {
      return item;
    }

    const segment: TranscriptSegment = {
      text: normalizedText,
      createdAt: now
    };
    return {
      ...item,
      updatedAt: now,
      segments: item.segments.concat(segment)
    };
  });

  await persistTranscriptStorage({ activeId: current.activeId, items });
}

/** Writes transcript storage and mirrors the active id into settings. */
async function persistTranscriptStorage(transcripts: Required<TranscriptStorage>): Promise<void> {
  const { settings = {} } = await getStorage('settings');
  await setStorage({
    transcripts,
    settings: {
      ...settings,
      activeTranscriptId: transcripts.activeId
    }
  });
}

/** Creates an empty transcript record for the selected language. */
function createTranscriptRecord(language?: TranscriptLanguage): TranscriptRecord {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    language: normalizeDeepgramLanguage(language || DEFAULT_LANGUAGE),
    createdAt: now,
    updatedAt: now,
    segments: []
  };
}

/** Normalizes unknown stored transcript lists into transcript records. */
function normalizeTranscriptRecords(value: unknown): TranscriptRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeTranscriptRecord(item))
    .filter((item): item is TranscriptRecord => item !== null);
}

/** Normalizes one stored transcript record and rejects invalid records. */
function normalizeTranscriptRecord(value: unknown): TranscriptRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TranscriptRecord>;
  const id = typeof candidate.id === 'string' && candidate.id.trim()
    ? candidate.id.trim()
    : '';
  if (!id) {
    return null;
  }

  const createdAt = normalizeTimestamp(candidate.createdAt);
  const updatedAt = normalizeTimestamp(candidate.updatedAt) || createdAt || Date.now();
  return {
    id,
    language: normalizeDeepgramLanguage(candidate.language),
    createdAt: createdAt || updatedAt,
    updatedAt,
    segments: normalizeSegments(candidate.segments)
  };
}

/** Normalizes stored transcript segments and drops empty or malformed entries. */
function normalizeSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((segment): segment is TranscriptSegment => {
      const candidate = segment as Partial<TranscriptSegment>;
      return typeof candidate.text === 'string'
        && candidate.text.trim().length > 0
        && Number.isFinite(candidate.createdAt);
    })
    .map((segment) => ({
      text: segment.text.trim(),
      createdAt: segment.createdAt
    }));
}

/** Converts unknown timestamp values into finite millisecond timestamps. */
function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
