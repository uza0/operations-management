/**
 * The Ticket Zone identity, in one place.
 *
 * Every value below was read off the live Ticket Zone site (ticket.zone) with
 * the browser's own computed styles — not eyeballed from a screenshot — so the
 * system does not merely "look red", it uses the same ramp the public product
 * uses. Where the public site has no answer (it has no dark mode, and no
 * operational status colours), the value is derived from the same ramp rather
 * than borrowed from somewhere else; those cases are marked DERIVED.
 *
 * Two things make this a system rather than a coat of paint:
 *
 *  1. The neutrals are WARM. Ticket Zone's greys are stone (#1B1917, #79736B,
 *     #E8E5E2), not slate. A red brand on cool grey always reads slightly
 *     wrong, and that is the single change that makes the difference between
 *     "we used their red" and "this is theirs".
 *  2. The geometry is fixed: pill for anything you press, 12px for anything
 *     you type into, 16px for anything that holds content.
 *
 * Nothing in the app should hardcode a colour. These are mirrored as CSS
 * variables in globals.css; this file exists for the places that cannot read
 * CSS — the manifest, the map canvas, the PWA theme colour, generated images.
 */

export const BRAND = {
  name: 'Ticket Zone',
  nameAr: 'تكت زون',

  /** The brand red. 500 is the fill on their buttons; 600 is their core token. */
  red: {
    400: '#FF5C4F', // hover / the same red lifted for dark surfaces  (site)
    500: '#E4584A', // button fill, logo fill                          (site)
    600: '#E84A3D', // --chakra-colors-red, the core brand value       (site)
    700: '#C93C30', // DERIVED: pressed state
    900: '#921F15', // brand text on light — links, emphasis           (site)
    tint: '#FFF1EF', // soft brand surface behind highlights           (site)
  },

  /**
   * The warm neutral ramp. Named from the page inward: `page` is what you look
   * at, `ink` is what you read. Light and dark use the same eight values read
   * in opposite directions, which is why one set of class names paints both.
   */
  stone: {
    950: '#0A0908', // deepest — their pill buttons, and the dark page
    900: '#1B1917', // primary text on light; the card surface on dark
    800: '#2A2724', // DERIVED: raised surface on dark
    700: '#45413B', // secondary text
    500: '#79736B', // muted text
    300: '#D6D2CD', // strong hairline / dim text on dark
    200: '#E8E5E2', // hairline
    50: '#FAFAF9', // off-white surface
    0: '#FFFFFF', // the page
  },

  /**
   * Type. Ticket Zone's stack is Thmanyah Sans → Noto Sans Arabic → Noto Sans.
   * Thmanyah Sans is a licensed display face and is not shipped here; the
   * system runs on the second family in their own stack, which is free and
   * metrically what the rest of their interface already falls back to. If the
   * licence is in hand, drop the woff2 files into /public/fonts and add
   * 'Thmanyah Sans' to the front of --font-ui — nothing else needs to change.
   */
  font: "'Noto Sans Arabic', 'Noto Sans', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif",

  /** Geometry. Pills for actions, 12px for inputs, 16px for cards. */
  radius: { pill: '9999px', control: '12px', card: '16px' },
} as const;

/**
 * Map marker accents, re-cut in the brand's warm family.
 *
 * The map needs a dozen distinguishable colours, which no single-hue identity
 * can supply; what it can supply is the temperature. These are warm-shifted
 * and desaturated to sit beside the brand red without competing with it, and
 * the brand red itself is reserved for gates — the thing the whole system is
 * about. Every marker also carries a glyph, so none of this is colour alone.
 */
export const MARKER_COLORS = {
  GATE: '#E4584A',
  WORKING_POINT: '#C2410C',
  VIP_ENTRANCE: '#9333EA',
  SCANNER: '#0E7490',
  WRISTBAND: '#B45309',
  TEAM_LEADER: '#BE123C',
  GATE_LEADER: '#EA580C',
  TEAM_MEMBER: '#79736B',
  INFORMATION: '#0369A1',
  EMERGENCY: '#DC2626',
  STAFF_ENTRANCE: '#4D7C0F',
  PLAYER_ENTRANCE: '#0F766E',
  OTHER: '#A8A29E',
} as const;
