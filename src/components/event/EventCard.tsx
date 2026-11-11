import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Dictionary } from '@/lib/i18n';
import type { EventStatus, EventType } from '@/lib/constants';
import { formatDate, formatTime } from '@/lib/time';
import { Badge, eventStatusTone, needsClosingTone } from '@/components/ui/status';
import { displayStage } from '@/lib/event-stage';
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
  /** Optional: without it an evening is judged from its start. */
  teamDepartureTime?: string | null;
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
  const stage = displayStage(event);

  const card = (
    <Link
      href={href}
      style={skin.surface}
      /*
       * Full height, because a grid row is as tall as its tallest card and a
       * card that stops short leaves its own controls hanging in the gap
       * below it — the delete button is placed against the bottom edge, and
       * without this that edge is not where the card ends.
       */
      className={`panel lift group block h-full p-4 hover:brightness-110 ${
        action ? 'pb-12' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15.5px] font-semibold text-ink-100">{event.name}</p>
          <p className="mt-0.5 text-[12.5px] font-semibold" style={skin.label}>
            {t.enums.eventType[event.type as EventType]}
          </p>
        </div>
        {/*
          What the clock says, which is not always what the record says: an
          evening whose attendance is unfinished stays LIVE so that nobody is
          paid for it yet, but it stopped being tonight days ago.
        */}
        <Badge
          tone={stage === 'NEEDS_CLOSING' ? needsClosingTone : eventStatusTone[status]}
          pulse={stage === 'LIVE'}
        >
          {stage === 'NEEDS_CLOSING' ? t.event.needsClosing : t.enums.eventStatus[status]}
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
        </div>
        {/*
          On its own line. It used to share the half-width column with the two
          counts, where its words were wider than the space left and ran out
          past the card's edge — a chip about trouble, itself broken.
        */}
        {event.openIssues ? (
          <div className="col-span-2">
            <Badge tone="crit" className="!py-0.5">
              <span className="nums">{event.openIssues}</span> {t.issue.openCount}
            </Badge>
          </div>
        ) : null}
      </dl>
    </Link>
  );

  if (!action) return card;

  return (
    <div className="relative h-full">
      {card}
      <div className="absolute bottom-3 end-3">{action}</div>
    </div>
  );
}
