/**
 * Arabic counts the thing it is counting.
 *
 * "7 دقيقة" is the kind of mistake that marks software as translated rather
 * than written, and it is produced by exactly one habit: treating a count as a
 * number glued to a fixed word. Arabic has five cases where English has two —
 * one, two, a few (3–10), many (11+), and the rest — and the word changes in
 * each.
 *
 * `Intl.PluralRules` already knows the rule for every locale the interface
 * might run in, so the only thing needed here is somewhere to keep the five
 * forms and a function that picks one.
 */
export type PluralForms = {
  one: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
};

const rules = new Map<string, Intl.PluralRules>();

function rulesFor(locale: string): Intl.PluralRules {
  let found = rules.get(locale);
  if (!found) {
    found = new Intl.PluralRules(locale);
    rules.set(locale, found);
  }
  return found;
}

/** Picks the form for `n`, and puts the number in place of `{n}`. */
export function plural(forms: PluralForms, n: number, locale = 'ar'): string {
  const category = rulesFor(locale).select(n) as keyof PluralForms;
  const text = forms[category] ?? forms.other;
  return text.replace('{n}', String(n));
}
