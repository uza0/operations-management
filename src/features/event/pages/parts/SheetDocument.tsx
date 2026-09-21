import { formatDate, formatTime } from '@/lib/time';
import { format, type Dictionary } from '@/lib/i18n';
import type { BoardData } from '@/server/services/board';

/**
 * The distribution sheet — the thing that gets printed and pinned up.
 *
 * It is laid out the way the supervisor's own sheet was: one block per gate,
 * a column per job, names numbered underneath, and the people still unassigned
 * listed at the bottom so nobody is quietly lost. It ends with somewhere to
 * sign, because on match day this leaves the system and becomes paper.
 *
 * Deliberately contains no phone numbers and no personal links: this document
 * is meant to be handed around.
 */
export function SheetDocument({
  t,
  locale,
  data,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  data: BoardData;
}) {
  const { event, locations, pool, totals } = data;

  return (
    <article className="report">
      <header className="report-masthead">
        <p className="report-org">{t.app.name}</p>
        <h1 className="report-title">{t.board.sheetTitle}</h1>
        <p className="report-subtitle">
          {event.name}
          {event.venueName ? ` · ${event.venueName}` : ''} · {formatDate(event.date, locale)}
        </p>
        <div className="report-meta">
          <span>
            {/* A range wants a range's name: "arrival time: 11:42 – 17:12"
                reads as though one of the two numbers is the arrival. */}
            {event.teamDepartureTime ? t.board.hours : t.event.teamArrivalTime}:{' '}
            {formatTime(event.teamArrivalTime, locale)}
            {event.teamDepartureTime
              ? ` – ${formatTime(event.teamDepartureTime, locale)}`
              : ''}
          </span>
          <span>
            {t.board.roster}: {totals.team} · {t.board.placed}: {totals.placed} ·{' '}
            {t.board.left}: {totals.left}
          </span>
        </div>
      </header>

      <div className="sheet-grid">
        {locations.map((location) => (
          <section key={location.id} className="sheet-block">
            <h2 className="sheet-block-head">
              <span>{location.name}</span>
              <span className="nums text-ink-400">
                {format(t.board.staffCount, { n: location.placed })}
              </span>
            </h2>
            <div className="sheet-lanes">
              {location.lanes.map((lane) => (
                <div key={lane.key} className="sheet-lane">
                  <p className="sheet-lane-head">
                    {t.enums.task[lane.task]}
                    <span className="nums"> ({lane.people.length})</span>
                  </p>
                  {lane.people.length === 0 ? (
                    <p className="sheet-none">{t.board.nobody}</p>
                  ) : (
                    <ol className="sheet-names">
                      {lane.people.map((person) => (
                        <li key={person.eventMemberId}>
                          <span className="nums sheet-idx" />
                          <span style={{ unicodeBidi: 'plaintext' }}>{person.name}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {pool.length > 0 ? (
        <section className="sheet-block mt-3">
          <h2 className="sheet-block-head">
            <span>{t.board.unplaced}</span>
            <span className="nums text-ink-400">{pool.length}</span>
          </h2>
          <p className="sheet-pool">
            {pool.map((person) => (
              <span key={person.eventMemberId} style={{ unicodeBidi: 'plaintext' }}>
                {person.name}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <div className="report-signatures">
        {[t.report.preparedSignature, t.report.reviewedSignature, t.report.approvedSignature].map(
          (role) => (
            <div key={role} className="report-signature">
              <p className="report-signature-role">{role}</p>
              <p className="report-signature-line" />
              <p className="report-signature-meta">{t.report.nameAndTitle}</p>
              <p className="report-signature-line" />
              <p className="report-signature-meta">{t.report.signature}</p>
            </div>
          ),
        )}
      </div>
    </article>
  );
}
