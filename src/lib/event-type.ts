import type { EventType } from '@/lib/constants';

/**
 * The colour each kind of evening wears.
 *
 * One place, because the same eight colours appear on the events list, on a
 * promoter's own page and in the bars of the numbers screen, and three copies
 * of a palette is three palettes within a month.
 *
 * Red is deliberately absent. Status owns red on every screen in this system
 * — a red chip means something is wrong — and a concert tinted the same red
 * would make the commonest evening of the week look like a fault. Green is
 * here only because a pitch is green and a football match is the one kind
 * nobody will misread.
 *
 * The colour is written as a CSS variable rather than a class so the tint can
 * be mixed at any strength from one token, and so both themes resolve from
 * the same name.
 */
export const TYPE_VAR: Record<EventType, string> = {
  FOOTBALL_MATCH: '--type-football',
  CONCERT: '--type-concert',
  FESTIVAL: '--type-festival',
  EXHIBITION: '--type-exhibition',
  CONFERENCE: '--type-conference',
  WORKSHOP: '--type-workshop',
  PROMOTIONAL: '--type-promotional',
  OTHER: '--type-other',
};

/** `rgb(var(--type-concert))`, or the neutral one for a type we do not know. */
export function typeColor(type: string): string {
  const name = TYPE_VAR[type as EventType] ?? TYPE_VAR.OTHER;
  return `rgb(var(${name}))`;
}

/**
 * The card's own skin for this kind: a washed tint, a tinted hairline, and
 * the colour itself for the type's name.
 *
 * Deliberately weak. The tint is there to be recognised at a glance across a
 * list, not to be read — anything stronger and the text on top of it starts
 * to swim, and eight of them in a column become a rainbow nobody can look at.
 */
export function typeSkin(type: string, base = '--ink-900') {
  const color = typeColor(type);
  return {
    /** For the card: background and border. */
    surface: {
      backgroundColor: `color-mix(in srgb, ${color} var(--type-tint), rgb(var(${base})))`,
      borderColor: `color-mix(in srgb, ${color} 32%, rgb(var(--ink-700)))`,
    } as const,
    /** For the type's name under the title. */
    label: { color } as const,
    /** For a legend dot, or a bar. */
    solid: { backgroundColor: color } as const,
  };
}
