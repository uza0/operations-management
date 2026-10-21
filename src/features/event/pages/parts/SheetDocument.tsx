import { formatDate, formatTime } from '@/lib/time';
import { format, type Dictionary } from '@/lib/i18n';
import type { BoardData } from '@/server/services/board';
import type { MainGateData } from '@/server/services/main-gate';

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
  mainGate,
}: {
  t: Dictionary;
  locale: 'ar' | 'en';
  data: BoardData;
  mainGate?: MainGateData | null;
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

      {/*
        * The early detail goes FIRST, because it happens first: whoever reads
        * this sheet at four in the afternoon needs the main entrance, not the
        * gates that open later. Every name here also appears below at its own
        * gate, which is correct — these people have two places to be.
        */}
      {mainGate?.detail && mainGate.people.length > 0 ? (
        <section className="sheet-block mb-3">
          <h2 className="sheet-block-head">
            <span>
              {t.mainGate.title} · {mainGate.detail.name}
            </span>
            <span className="nums text-ink-400">
              {formatTime(mainGate.detail.startTime, locale)} –{' '}
              {formatTime(mainGate.detail.endTime, locale)}
            </span>
          </h2>
          <div className="sheet-lanes">
            {mainGate.groups
              .filter((group) => group.people.length > 0)
              .map((group) => (
                <div key={group.task} className="sheet-lane">
                  <p className="sheet-lane-head">
                    {t.enums.task[group.task]}
                    <span className="nums"> ({group.people.length})</span>
                  </p>
                  <ol className="sheet-names">
                    {group.people.map((person) => (
                      <li key={person.id}>
                        <span className="nums sheet-idx" />
                        <span className="sheet-person">
                          <span style={{ unicodeBidi: 'plaintext' }}>{person.name}</span>
                          {person.normalPlace ? (
                            <span className="sheet-role">
                              {format(t.mainGate.thenBackTo, { place: person.normalPlace })}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
          </div>
          {mainGate.detail.notes ? (
            <p className="sheet-pool">{mainGate.detail.notes}</p>
          ) : null}
        </section>
      ) : null}

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
                          {/*
                           * Name and role share one cell, the role on its own
                           * line: a lane column is narrow, and a label sitting
                           * beside the name would push the name itself onto
                           * two lines for the sake of a subtitle.
                           */}
                          <span className="sheet-person">
                            <span style={{ unicodeBidi: 'plaintext' }}>{person.name}</span>
                            {person.eventRole ? (
                              <span className="sheet-role">
                                {t.enums.eventRole[person.eventRole]}
                              </span>
                            ) : null}
                          </span>
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
