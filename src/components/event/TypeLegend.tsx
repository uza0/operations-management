import type { Dictionary } from '@/lib/i18n';
import { EVENT_TYPES } from '@/lib/constants';
import { typeSkin } from '@/lib/event-type';

/**
 * What the colours mean, written once under the list that uses them.
 *
 * A colour nobody has been told the meaning of is decoration. This is small
 * and quiet on purpose — it is read once, by somebody new, and then never
 * again.
 */
export function TypeLegend({ t }: { t: Dictionary }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-1">
      {EVENT_TYPES.map((type) => (
        <li key={type} className="flex items-center gap-1.5 text-[12px] text-ink-400">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={typeSkin(type).solid}
          />
          {t.enums.eventType[type]}
        </li>
      ))}
    </ul>
  );
}
