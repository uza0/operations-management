import { Badge } from '@/components/ui/status';
import { format, type Dictionary, type Locale } from '@/lib/i18n';
import { plural } from '@/lib/plural';
import { formatDateTime } from '@/lib/time';
import type { DeclineReason } from '@/lib/constants';
import type { InvitationBoard as Board, InvitationRow } from '@/server/services/journey';

/**
 * Who has answered, and what to do about the ones who have not.
 *
 * Four lists and not a status column, because they are four different jobs —
 * and "past the deadline" is deliberately its own list rather than a quiet
 * cancellation. Silence is not an answer; it is a flat battery, a message in
 * a muted group, a man who forgot. The system says so and hands it to
 * somebody with a phone.
 */
export function InvitationBoard({
  t,
  locale,
  board,
}: {
  t: Dictionary;
  locale: Locale;
  board: Board;
}) {
  const groups: Array<{
    key: string;
    title: string;
    tone: 'ok' | 'warn' | 'crit' | 'neutral';
    rows: InvitationRow[];
  }> = [
    { key: 'overdue', title: t.journey.overdueList, tone: 'warn', rows: board.overdue },
    { key: 'waiting', title: t.journey.waitingReply, tone: 'neutral', rows: board.waiting },
    { key: 'declined', title: t.journey.declinedList, tone: 'crit', rows: board.declined },
    { key: 'confirmed', title: t.journey.confirmedList, tone: 'ok', rows: board.confirmed },
  ];

  const now = Date.now();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <Badge key={group.key} tone={group.tone}>
            {group.title} <span className="nums ms-1">{group.rows.length}</span>
          </Badge>
        ))}
      </div>

      {groups
        .filter((group) => group.rows.length > 0 && group.key !== 'confirmed')
        .map((group) => (
          <section key={group.key} className="panel p-0">
            <h3 className="border-b border-ink-800 px-4 py-2.5 text-[13.5px] font-bold text-ink-100">
              {group.title}
              <span className="nums ms-2 font-normal text-ink-400">{group.rows.length}</span>
            </h3>
            <ul className="divide-y divide-ink-800">
              {group.rows.map((row) => (
                <li
                  key={row.eventMemberId}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[14px] font-medium text-ink-100"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {row.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-500">
                      {row.urgent ? (
                        <span className="text-warn-text">{t.journey.urgent}</span>
                      ) : row.overdue && row.respondBy ? (
                        <span className="text-warn-text">
                          {format(t.journey.overdueSince, {
                            time: plural(
                              t.member.spanHours,
                              Math.max(
                                1,
                                Math.round((now - row.respondBy.getTime()) / 3_600_000),
                              ),
                              locale,
                            ),
                          })}
                        </span>
                      ) : row.declineReason ? (
                        t.enums.declineReason[row.declineReason as DeclineReason]
                      ) : row.respondBy ? (
                        <span className="nums">
                          {format(t.journey.deadlineAt, {
                            when: formatDateTime(row.respondBy, locale),
                          })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {/*
                    The one action that actually helps at this point, and the
                    reason the row exists: ring him.
                  */}
                  {row.phone && group.key !== 'declined' ? (
                    <a href={`tel:${row.phone}`} className="btn-secondary btn-sm">
                      {t.journey.call}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
