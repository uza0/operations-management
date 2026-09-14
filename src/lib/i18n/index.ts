import { ar, type Dictionary } from './ar';
import { en } from './en';

export type Locale = 'ar' | 'en';
export const LOCALES: Locale[] = ['ar', 'en'];
export const LOCALE_COOKIE = 'ops_locale';
export const DEFAULT_LOCALE: Locale = 'ar';

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(value: unknown): value is Locale {
  return value === 'ar' || value === 'en';
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Fills `{placeholders}` in a dictionary string. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type { Dictionary };
export { ar, en };
