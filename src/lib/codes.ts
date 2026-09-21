/**
 * Employee codes, issued by the system instead of typed by hand.
 *
 * The code is the one identifier that follows a person through every event,
 * assignment, report and audit line they ever appear in, so a mistyped or
 * reused one is expensive to unpick later. Asking a supervisor to invent the
 * next number while he is adding people between matches is asking for exactly
 * that mistake, so he is not asked: the next number is read off the roster.
 *
 * The shape comes from the roster itself rather than being hard-coded — the
 * existing codes are TZ-001…TZ-092, so the next is TZ-093, with the same
 * prefix, the same separator and the same zero padding. A roster that one day
 * uses a different prefix keeps working without a code change here.
 *
 * Kept free of database imports so the rule can be exercised on its own.
 */

/** Fallback for a completely empty roster — nothing to learn the shape from. */
const DEFAULT_PREFIX = 'TZ-';
const DEFAULT_WIDTH = 3;

export type CodeShape = { prefix: string; width: number; next: number };

/** Splits "TZ-092" into its parts. Anything else is not a numbered code. */
function parseCode(code: string): { prefix: string; digits: string } | null {
  const match = /^(.*?)(\d+)$/.exec(code.trim());
  if (!match) return null;
  return { prefix: match[1], digits: match[2] };
}

/**
 * What the next code should look like, decided by what the roster already
 * looks like. The commonest prefix wins, so one oddity typed by hand years ago
 * does not drag the whole sequence off.
 */
export function shapeFromCodes(codes: string[]): CodeShape {
  const parsed = codes
    .map((code) => parseCode(code))
    .filter((value): value is { prefix: string; digits: string } => value !== null);

  if (parsed.length === 0) {
    return { prefix: DEFAULT_PREFIX, width: DEFAULT_WIDTH, next: 1 };
  }

  const counts = new Map<string, number>();
  for (const { prefix } of parsed) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  const prefix = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];

  const mine = parsed.filter((entry) => entry.prefix === prefix);
  const highest = Math.max(...mine.map((entry) => Number(entry.digits)));
  // Padding follows the widest code in use, so 099 → 100 widens naturally and
  // never silently becomes 00100.
  const width = Math.max(DEFAULT_WIDTH, ...mine.map((entry) => entry.digits.length));

  return { prefix, width, next: highest + 1 };
}

export function formatCode(shape: CodeShape, n: number): string {
  return `${shape.prefix}${String(n).padStart(shape.width, '0')}`;
}

/**
 * The next free code, given every code already in use.
 *
 * Counts up from the highest, skipping anything already taken — a gap left by
 * a deleted person is NOT reused, because the code of someone who has been
 * removed may still be written on last season's paperwork.
 */
export function nextCodeFrom(existing: string[]): string {
  const taken = new Set(existing.map((code) => code.trim()));
  const shape = shapeFromCodes(existing);
  let n = shape.next;
  let code = formatCode(shape, n);
  // Two people added in the same second, or a code typed by hand into the gap:
  // either way, keep walking until the number is genuinely free.
  while (taken.has(code)) {
    n += 1;
    code = formatCode(shape, n);
  }
  return code;
}
