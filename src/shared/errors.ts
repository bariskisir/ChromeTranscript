/** Shared helpers for normalizing unknown errors into user-facing results. */
import type { ErrorResult } from './types';

/** Converts unknown error values into readable fallback strings. */
export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

/** Converts an unknown error into the standard extension error result shape. */
export function toErrorResult(error: unknown): ErrorResult {
  return { ok: false, error: getErrorMessage(error) };
}
