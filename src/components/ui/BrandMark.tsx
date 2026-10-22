/**
 * The mark.
 *
 * Operations Management is an internal product inside Ticket Zone, so it gets
 * a mark in the family rather than a copy of the public wordmark: the same
 * brand red, the same squared-bracket silhouette the Ticket Zone logo is built
 * from, and the star it carries at its centre — but the bracket closes around
 * a gate rather than a ticket, which is what this system is about. Put beside
 * the company logo it reads as the same house; put on its own it reads as a
 * product, not as the company's homepage.
 *
 * If the official lockup is cleared for use, drop the SVG at
 * /public/brand/ticket-zone.svg and render it here instead — this component is
 * the only place in the app that draws the mark.
 */
export function BrandMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-hidden
      className={className}
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      {/*
        The bracket: an open gate seen from above, drawn with the same stroke
        rhythm and the same squared corners as the Ticket Zone mark.
      */}
      <path
        d="M9.5 8.5H7.25C6.56 8.5 6 9.06 6 9.75v12.5c0 .69.56 1.25 1.25 1.25H9.5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M22.5 8.5h2.25c.69 0 1.25.56 1.25 1.25v12.5c0 .69-.56 1.25-1.25 1.25H22.5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* The star, from their mark, held between the gate posts. */}
      <g transform="translate(16 16) scale(0.86) translate(-16 -16)">
        <path
          d="M16 9.6l1.84 3.84 4.12.62-2.98 2.99.7 4.23L16 19.29l-3.68 1.99.7-4.23-2.98-2.99 4.12-.62L16 9.6z"
          fill="#fff"
        />
      </g>
    </svg>
  );
}
