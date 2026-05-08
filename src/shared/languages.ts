/** Deepgram Nova-3 language options used for realtime transcript capture. */

export interface DeepgramLanguageOption {
  value: string;
  label: string;
  model?: string;
}

export const DEFAULT_TRANSCRIPT_LANGUAGE = 'tr';

export const DEEPGRAM_LANGUAGE_OPTIONS = [
  { value: 'tr', label: 'Turkish' },
  { value: 'en-US', label: 'English' },
  { value: 'multi', label: 'Multilingual' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ar-DZ', label: 'Arabic (Algeria)' },
  { value: 'ar-TD', label: 'Arabic (Chad)' },
  { value: 'ar-EG', label: 'Arabic (Egypt)' },
  { value: 'ar-IR', label: 'Arabic (Iran)' },
  { value: 'ar-IQ', label: 'Arabic (Iraq)' },
  { value: 'ar-JO', label: 'Arabic (Jordan)' },
  { value: 'ar-KW', label: 'Arabic (Kuwait)' },
  { value: 'ar-LB', label: 'Arabic (Lebanon)' },
  { value: 'ar-MA', label: 'Arabic (Morocco)' },
  { value: 'ar-PS', label: 'Arabic (Palestine)' },
  { value: 'ar-QA', label: 'Arabic (Qatar)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'ar-SD', label: 'Arabic (Sudan)' },
  { value: 'ar-SY', label: 'Arabic (Syria)' },
  { value: 'ar-TN', label: 'Arabic (Tunisia)' },
  { value: 'ar-AE', label: 'Arabic (United Arab Emirates)' },
  { value: 'be', label: 'Belarusian' },
  { value: 'bn', label: 'Bengali' },
  { value: 'bs', label: 'Bosnian' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'ca', label: 'Catalan' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'zh-CN', label: 'Chinese (Mandarin, Simplified)' },
  { value: 'zh-Hans', label: 'Chinese (Mandarin, Simplified Script)' },
  { value: 'zh-TW', label: 'Chinese (Mandarin, Traditional)' },
  { value: 'zh-Hant', label: 'Chinese (Mandarin, Traditional Script)' },
  { value: 'zh-HK', label: 'Chinese (Cantonese, Traditional)', model: 'nova-2' },
  { value: 'hr', label: 'Croatian' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'da-DK', label: 'Danish (Denmark)' },
  { value: 'nl', label: 'Dutch' },
  { value: 'en', label: 'English (General)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-NZ', label: 'English (New Zealand)' },
  { value: 'et', label: 'Estonian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'nl-BE', label: 'Flemish' },
  { value: 'fr', label: 'French' },
  { value: 'fr-CA', label: 'French (Canada)' },
  { value: 'de', label: 'German' },
  { value: 'de-CH', label: 'German (Switzerland)' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ko', label: 'Korean' },
  { value: 'ko-KR', label: 'Korean (South Korea)' },
  { value: 'lv', label: 'Latvian' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'mk', label: 'Macedonian' },
  { value: 'ms', label: 'Malay' },
  { value: 'mr', label: 'Marathi' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fa', label: 'Persian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'sr', label: 'Serbian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'sl', label: 'Slovenian' },
  { value: 'es', label: 'Spanish' },
  { value: 'es-419', label: 'Spanish (Latin America)' },
  { value: 'sv', label: 'Swedish' },
  { value: 'sv-SE', label: 'Swedish (Sweden)' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'ta', label: 'Tamil' },
  { value: 'taq', label: 'Tamasheq', model: 'enhanced' },
  { value: 'te', label: 'Telugu' },
  { value: 'th', label: 'Thai', model: 'nova-2' },
  { value: 'th-TH', label: 'Thai (Thailand)', model: 'nova-2' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ur', label: 'Urdu' },
  { value: 'vi', label: 'Vietnamese' }
] as const satisfies readonly DeepgramLanguageOption[];

export type DeepgramLanguageCode = typeof DEEPGRAM_LANGUAGE_OPTIONS[number]['value'];

const LANGUAGE_VALUES = new Set<string>(DEEPGRAM_LANGUAGE_OPTIONS.map((option) => option.value));

/** Checks whether a value is a supported Deepgram language code. */
export function isDeepgramLanguageCode(value: unknown): value is DeepgramLanguageCode {
  return typeof value === 'string' && LANGUAGE_VALUES.has(value);
}

/** Normalizes stored and legacy language values into supported Deepgram codes. */
export function normalizeDeepgramLanguage(value: unknown): DeepgramLanguageCode {
  if (value === 'tr-TR') {
    return 'tr';
  }

  return isDeepgramLanguageCode(value) ? value : DEFAULT_TRANSCRIPT_LANGUAGE;
}

/** Returns the display label for a supported Deepgram language code. */
export function getDeepgramLanguageLabel(value: DeepgramLanguageCode): string {
  const options: readonly DeepgramLanguageOption[] = DEEPGRAM_LANGUAGE_OPTIONS;
  return options.find((option) => option.value === value)?.label || value;
}

/** Returns a compatible Deepgram model for language codes outside Nova-3. */
export function getDeepgramModelForLanguage(value: DeepgramLanguageCode): string {
  const options: readonly DeepgramLanguageOption[] = DEEPGRAM_LANGUAGE_OPTIONS;
  return options.find((option) => option.value === value)?.model || 'nova-3';
}
