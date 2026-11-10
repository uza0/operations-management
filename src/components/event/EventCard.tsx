import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Dictionary } from '@/lib/i18n';
import type { EventStatus, EventType } from '@/lib/constants';
import { formatDate, formatTime } from '@/lib/time';
import { Badge, eventStatusTone } from '@/components/ui/status';
import { IconGate, IconPin, IconUsers, IconClock } from '@/components/ui/icons';
import { typeSkin } from '@/lib/event-type';

export type EventCardData = {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  startTime: string;
  teamArrivalTime: string;
  venueName: string;
  teamSize: number;
  gateCount: number;
  openIssues?: number;
};

export function EventCard({
  event,
  t,
  locale,
  href,
  action,
}: {
  event: EventCardData;
  t: Dictionary;
  locale: 'ar' | 'en';
  href: string;
  /**
   * A control that belongs to the card but not to the link — deleting, for
   * one. It sits outside the anchor on purpose: a button inside a link is a
   * link as far as a keyboard and a screen reader are concerned, and tapping
   * it on a phone opens the event instead of doing what it says.
   */
  action?: ReactNode;
}) {
  const status = event.status as EventStatus;
  /*
   * The kind of evening, worn as the card's own colour. The status chip keeps
   * its own palette on top of it, which is the whole arrangement: the card
   * says what this is, the chip says how it is going.
   */
  const skin = typeSkin(event.type);

  const card = (
    <Link
      href={href}
      style={skin.surface}
      className={`panel lift group block p-4 hover:brightness-110 ${
        action ? 'pb-12' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15.5px] font-semibold text-ink-100">{event.name}</p>
          <p className="mt-0.5 text-[12.5px] font-semibold" style={skin.label}>
            {t.enums.eventType[event.type as EventType]}
          </p>
        </div>
        <Badge tone={eventStatusTone[status]} pulse={status === 'LIVE'}>
          {t.enums.eventStatus[status]}
        </Badge>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div className="col-span-2 flex items-center gap-2 text-ink-300">
          <IconPin width={15} height={15} className="shrink-0 text-ink-500" />
          <span className="truncate">{event.venueName}</span>
        </div>
        <div className="flex items-center gap-2 text-ink-300">
          <IconClock width={15} height={15} className="shrink-0 text-ink-500" />
          <span className="truncate">
            {formatDate(event.date, locale)} · {formatTime(event.startTime, locale)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-ink-300">
          <span className="flex items-center gap-1.5">
            <IconUsers width={15} height={15} className="text-ink-500" />
            <span className="nums">{event.teamSize}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <IconGate width={15} height={15} className="text-ink-500" />
            <span className="nums">{event.gateCount}</span>
          </span>
          {event.openIssues ? (
            <Badge tone="crit" className="!py-0.5">
              <span className="nums">{event.openIssues}</span> {t.issue.openCount}
            </Badge>
          ) : null}
        </div>
      </dl>
    </Link>
  );

  if (!action) return card;

  return (
    <div className="relative">
      {card}
      <div className="absolute bottom-3 end-3">{action}</div>
    </div>
  );
}
