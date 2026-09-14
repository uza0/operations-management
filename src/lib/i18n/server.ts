import 'server-only';
import { cookies } from 'next/headers';

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getDictionary,
  isLocale,
  type Locale,
} from './index';

/** Reads the locale from the cookie; falls back to DEFAULT_LOCALE (Arabic). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value;
  const envDefault = process.env.DEFAULT_LOCALE;
  return isLocale(envDefault) ? envDefault : DEFAULT_LOCALE;
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
