import { loadManagedEventPage } from '@/features/event/workspace';
import { buildFindings, buildReport } from '@/server/services/report';
import { buildExpenses } from '@/server/services/expenses';
import { formatAmount } from '@/lib/money';
import type { ExpenseCategory } from '@/lib/constants';
import { Badge, eventStatusTone, issueStatusTone } from '@/components/ui/status';
import { format, type Dictionary } from '@/lib/i18n';
import { formatDate, formatDateTime, formatTime } from '@/lib/time';
import {
  FEEDBACK_MIN_GROUP,
  type AttendanceStatus,
  type EventStatus,
  type EventType,
  type IssueStatus,
  type IssueType,
  type Task,
} from '@/lib/constants';

import { PrintButton, ReportNotes } from './parts/ReportParts';
import { ReportTypeSelector, type ReportView } from './parts/ReportTypeSelector';
import {
  CoverageBar,
  Fact,
  FactGrid,
  ReportSection,
  ReportTable,
  SignatureBlock,
  Statements,
} from './parts/ReportDocument';

/**
 * The closing report (spec §27).
 *
 * Written as a document rather than a screen: ten numbered sections, an
 * executive summary computed from the event's own numbers, recommendations that
 * name a gate and a count, and a sign-off block. It prints to A4 without the
 * application around it, so "save as PDF" produces something that can be sent
 * to a manager as-is.
 */
export async function EventReportPage({
  eventId,
  base,
  requestedView,
}: {
  eventId: string;
  base: '/admin' | '/leader';
  requestedView?: string;
}) {
  const { scope, event, locale, t } = await loadManagedEventPage(eventId);
  const canSeeFinance = scope.user.role === 'ADMIN';
  const allowedViews: ReportView[] = ['general', 'attendance', 'expenses', 'issues', 'survey', 'operations'];
  const view: ReportView = allowedViews.includes(requestedView as ReportView)
    && (requestedView !== 'expenses' || canSeeFinance)
    ? (requestedView as ReportView)
    : 'general';
  const visible = (category: ReportView | 'all') =>
    view === 'general' || category === 'all' || category === view;
  const data = await buildReport(eventId);
  const expenses = canSeeFinance ? await buildExpenses(eventId) : null;
  const hasExpenses = Boolean(expenses?.lines.length);
  const sectionIndex = (section: string) => {
    if (view === 'general') {
      const general: Record<string, number> = {
        summary: 1, event: 2, staff: 3, attendance: 4, changes: 5, issues: 6,
        timeline: 7, communication: 8, expenses: 9, notes: hasExpenses ? 10 : 9,
        survey: hasExpenses ? 11 : 10, signoff: hasExpenses ? 12 : 11,
      };
      return general[section];
    }
    const selected: Record<ReportView, Record<string, number>> = {
      general: {},
      attendance: { event: 1, staff: 2, attendance: 3, changes: 4 },
      expenses: { event: 1, expenses: 2 },
      issues: { event: 1, issues: 2 },
      survey: { event: 1, survey: 2 },
      operations: { event: 1, staff: 2, changes: 3, timeline: 4, communication: 5, notes: 6 },
    };
    return selected[view][section] ?? 0;
  };
  const { findings, recommendations } = buildFindings(data, t, format);

  const generatedAt = new Date();
  // Short, human, and stable for one event on one day — enough for a filing
  // reference on a printed page.
  const reportNo = `OPS-${event.date.replace(/-/g, '')}-${event.id.slice(0, 4).toUpperCase()}`;
  const finished = event.status === 'COMPLETED' || event.status === 'ARCHIVED';

  const attendanceLabel = (status: AttendanceStatus | 'PENDING') =>
    t.enums.attendanceStatus[status as AttendanceStatus] ?? status;

  return (
    <>
      <div className="app-chrome mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-ink-100">{t.report.views[view]}</h1>
          <p className="mt-0.5 text-[13px] text-ink-400">{t.report.subtitle}</p>
        </div>
        <PrintButton label={t.report.printReport} />
      </div>

      <ReportTypeSelector eventId={eventId} base={base} current={view} canSeeFinance={canSeeFinance} t={t} />

      <article className="report-doc">
        {/* Masthead ------------------------------------------------------- */}
        <header className="report-masthead">
          <p className="report-kicker">{t.app.name}</p>
          <h1 className="report-title">{t.report.documentTitles[view]}</h1>
          <p className="report-subtitle">
            {event.name} · {event.venue.name} ·{' '}
            <span className="nums">{formatDate(event.date, locale)}</span>
          </p>
          <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 text-[12.5px] text-ink-400 sm:grid-cols-3">
            <p>
              {t.report.reportNo}: <span className="nums text-ink-200">{reportNo}</span>
            </p>
            <p>
              {t.report.generatedAt}:{' '}
              <span className="nums text-ink-200">
                {formatDateTime(generatedAt, locale)}
              </span>
            </p>
            <p>
              {t.report.preparedBy}: <span className="text-ink-200">{scope.user.name}</span>
            </p>
          </div>
          {!finished ? <p className="report-hint mt-3">{t.report.incomplete}</p> : null}
        </header>

        {/* 1 — Executive summary ------------------------------------------ */}
        <ReportSection index={sectionIndex('summary')} title={t.report.section1} visible={view === 'general'}>
          <Statements items={findings} />
        </ReportSection>

        {/* 2 — Event details ---------------------------------------------- */}
        <ReportSection index={sectionIndex('event')} title={t.report.section2} visible={visible('all')}>
          <FactGrid>
            <div>
              <Fact label={t.event.name}>{event.name}</Fact>
              {/*
                The company's own number, printed where the report is read
                against their books. Absent rather than blank when nobody has
                sent one: an empty row invites somebody to wonder whether it
                was lost.
              */}
              {event.externalId ? (
                <Fact label={t.event.externalId}>
                  <span className="nums" style={{ unicodeBidi: 'plaintext' }}>
                    {event.externalId}
                  </span>
                </Fact>
              ) : null}
              <Fact label={t.event.type}>{t.enums.eventType[event.type as EventType]}</Fact>
              <Fact label={t.event.venue}>{event.venue.name}</Fact>
              <Fact label={t.common.status}>
                <Badge tone={eventStatusTone[event.status as EventStatus]}>
                  {t.enums.eventStatus[event.status as EventStatus]}
                </Badge>
              </Fact>
            </div>
            <div>
              <Fact label={t.event.date}>
                <span className="nums">{formatDate(event.date, locale)}</span>
              </Fact>
              <Fact label={t.event.arrival}>
                <span className="nums">{formatTime(event.teamArrivalTime, locale)}</span>
              </Fact>
              <Fact label={t.event.kickoff}>
                <span className="nums">{formatTime(event.startTime, locale)}</span>
              </Fact>
              <Fact label={t.event.teamSize}>
                <span className="nums">{data.team.total}</span>
              </Fact>
            </div>
          </FactGrid>
        </ReportSection>

        {/* 3 — Staffing and coverage --------------------------------------- */}
        <ReportSection index={sectionIndex('staff')} title={t.report.section3} visible={view === 'attendance' || view === 'operations' || view === 'general'}>
          {data.locations.length === 0 ? (
            <p className="report-hint">{t.report.none}</p>
          ) : (
            <ReportTable
              head={[
                t.assignment.location,
                t.gate.requiredStaff,
                t.gate.assignedStaff,
                t.gate.difference,
                t.report.coverage,
              ]}
            >
              {data.locations.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium text-ink-100">{l.name}</td>
                  <td className="nums">{l.required}</td>
                  <td className="nums">{l.assigned}</td>
                  {/*
                    `difference` is required minus assigned, so a positive value
                    means the location is SHORT. The column reads as a balance —
                    what the location has over or under its requirement — so the
                    sign is flipped here and a shortfall shows in red.
                  */}
                  <td
                    className={`nums ${
                      l.difference > 0
                        ? 'text-crit-text'
                        : l.difference < 0
                          ? 'text-ok-text'
                          : ''
                    }`}
                  >
                    {l.difference > 0 ? `-${l.difference}` : l.difference < 0 ? `+${-l.difference}` : '0'}
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <CoverageBar value={l.coverage} />
                      <span className="nums text-[12.5px]">{l.coverage}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}

          {data.tasks.length > 0 ? (
            <>
            <h3 className="mt-4 text-[13.5px] font-semibold text-ink-200">
              {t.report.taskSpread}
            </h3>
            <FactGrid>
              {data.tasks.map((row) => (
                <Fact key={row.task} label={t.enums.task[row.task as Task] ?? row.task}>
                  <span className="nums">{row.count}</span>
                </Fact>
              ))}
            </FactGrid>
            </>
          ) : null}
        </ReportSection>

        {/* 4 — Attendance --------------------------------------------------- */}
        <ReportSection index={sectionIndex('attendance')} title={t.report.section4} visible={view === 'attendance' || view === 'general'}>
          <FactGrid>
            <div>
              {(['PRESENT', 'LATE', 'ABSENT'] as const).map((status) => (
                <Fact key={status} label={attendanceLabel(status)}>
                  <span className="nums">{data.attendance[status]}</span>
                </Fact>
              ))}
              <Fact label={attendanceLabel('EXCUSED')}>
                <span className="nums">{data.attendance.EXCUSED}</span>
              </Fact>
            </div>
            <div>
              <Fact label={t.attendance.rate}>
                <span className="nums">{data.attendance.rate}%</span>
              </Fact>
              <Fact label={t.report.punctuality}>
                <span className="nums">{data.attendance.punctualityRate}%</span>
              </Fact>
              <Fact label={t.report.briefed}>
                <span className="nums">
                  {data.team.briefed} / {data.team.total}
                </span>
              </Fact>
              <Fact label={t.eventTeam.reserve}>
                <span className="nums">{data.team.reserve}</span>
              </Fact>
            </div>
          </FactGrid>

          {data.locations.some((l) => l.absent > 0 || l.late > 0) ? (
            <ReportTable
              head={[
                t.assignment.location,
                attendanceLabel('PRESENT'),
                attendanceLabel('LATE'),
                attendanceLabel('ABSENT'),
              ]}
            >
              {data.locations
                .filter((l) => l.present + l.late + l.absent > 0)
                .map((l) => (
                  <tr key={l.id}>
                    <td className="font-medium text-ink-100">{l.name}</td>
                    <td className="nums">{l.present}</td>
                    <td className="nums">{l.late}</td>
                    <td className={`nums ${l.absent > 0 ? 'text-crit-text' : ''}`}>{l.absent}</td>
                  </tr>
                ))}
            </ReportTable>
          ) : null}

          {/*
            The names behind the numbers above. A closing report is read by
            people who were not there and checked by people who were, and only
            a list of names lets the second group do that — it is also the
            list the days credited are paid against, so both sit on one line.
          */}
          {data.roster.length > 0 ? (
            <>
              <h3 className="mt-4 text-[13.5px] font-semibold text-ink-200">
                {t.credit.attendanceNames}
              </h3>
              <ReportTable
                head={[
                  t.team.fullName,
                  t.team.employeeCode,
                  t.assignment.location,
                  t.common.status,
                  t.attendance.checkIn,
                  ...(canSeeFinance ? [t.credit.days] : []),
                ]}
              >
                {data.roster.map((line) => (
                  <tr key={line.eventMemberId}>
                    <td className="font-medium text-ink-100">
                      {line.name}
                      {line.isReserve ? (
                        <span className="text-ink-500"> · {t.eventTeam.reserve}</span>
                      ) : null}
                    </td>
                    <td className="nums">{line.employeeCode}</td>
                    <td>{line.locationName ?? '—'}</td>
                    <td
                      className={
                        line.status === 'ABSENT'
                          ? 'text-crit-text'
                          : line.status === 'LATE'
                            ? 'text-warn-text'
                            : ''
                      }
                    >
                      {attendanceLabel(line.status)}
                    </td>
                    <td className="nums report-nowrap">
                      {line.checkInTime ? formatTime(line.checkInTime, locale) : '—'}
                      {line.checkOutTime
                        ? ` — ${formatTime(line.checkOutTime, locale)}`
                        : ''}
                    </td>
                    {canSeeFinance ? <td className="nums">
                      {line.amount}
                      {line.note ? <span className="block text-[12px] text-ink-500">{line.note}</span> : null}
                    </td> : null}
                  </tr>
                ))}
              </ReportTable>
              {canSeeFinance ? <p className="report-hint">{format(t.credit.eventTotal, { n: data.totalPay })}</p> : null}
            </>
          ) : null}
        </ReportSection>

        {/* 5 — Changes during the event ------------------------------------ */}
        <ReportSection index={sectionIndex('changes')} title={t.report.section5} visible={view === 'attendance' || view === 'operations' || view === 'general'}>
          {data.changes.length === 0 ? (
            <p className="report-hint">{t.report.none}</p>
          ) : (
            <ReportTable
              head={[
                t.team.fullName,
                `${t.common.of}`,
                t.assignment.location,
                t.common.reason,
                t.common.by,
                t.common.time,
              ]}
            >
              {data.changes.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-ink-100">{c.memberName}</td>
                  <td>{c.fromLocation ?? '—'}</td>
                  <td>{c.toLocation ?? '—'}</td>
                  <td>{c.reason ?? '—'}</td>
                  <td>{c.changedByName}</td>
                  <td className="nums report-nowrap">
                    {formatDateTime(c.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* 6 — Issues ------------------------------------------------------- */}
        <ReportSection index={sectionIndex('issues')} title={t.report.section6} visible={view === 'issues' || view === 'general'}>
          <FactGrid>
            <div>
              <Fact label={t.common.total}>
                <span className="nums">{data.issues.total}</span>
              </Fact>
              <Fact label={t.report.resolvedCount}>
                <span className="nums">{data.issues.resolved}</span>
              </Fact>
            </div>
            <div>
              <Fact label={t.report.openCount}>
                <span className={`nums ${data.issues.open > 0 ? 'text-crit-text' : ''}`}>
                  {data.issues.open}
                </span>
              </Fact>
              <Fact label={t.report.avgResolve}>
                {data.issues.averageMinutesToResolve === null ? (
                  '—'
                ) : (
                  <span className="nums">
                    {data.issues.averageMinutesToResolve} {t.report.minutes}
                  </span>
                )}
              </Fact>
            </div>
          </FactGrid>

          {data.issues.rows.length === 0 ? (
            <p className="report-hint">{t.report.none}</p>
          ) : (
            <ReportTable
              head={[
                t.report.issueType,
                t.assignment.location,
                t.common.description,
                t.report.reportedBy,
                t.common.status,
                t.report.duration,
              ]}
            >
              {data.issues.rows.map((issue) => (
                <tr key={issue.id}>
                  <td className="report-nowrap font-medium text-ink-100">
                    {t.enums.issueType[issue.type as IssueType]}
                  </td>
                  <td>{issue.locationName ?? '—'}</td>
                  <td>
                    {issue.description}
                    {issue.resolutionNote ? (
                      <span className="mt-1 block text-[12px] text-ink-400">
                        {t.report.resolution}: {issue.resolutionNote}
                      </span>
                    ) : null}
                  </td>
                  <td>{issue.reporterName}</td>
                  <td>
                    <Badge tone={issueStatusTone[issue.status as IssueStatus]}>
                      {t.enums.issueStatus[issue.status as IssueStatus]}
                    </Badge>
                  </td>
                  <td className="nums report-nowrap">
                    {issue.minutesToResolve === null
                      ? '—'
                      : `${issue.minutesToResolve} ${t.report.minutes}`}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* 7 — Timeline ----------------------------------------------------- */}
        <ReportSection index={sectionIndex('timeline')} title={t.report.section7} visible={view === 'operations' || view === 'general'}>
          {data.timeline.length === 0 ? (
            <p className="report-hint">{t.report.none}</p>
          ) : (
            <ReportTable head={[t.report.planned, t.common.name, t.common.status]}>
              {data.timeline.map((item) => (
                <tr key={item.id}>
                  <td className="nums report-nowrap">
                    {formatTime(item.scheduledTime, locale)}
                  </td>
                  <td>
                    <span className="font-medium text-ink-100">{item.title}</span>
                    {item.description ? (
                      <span className="mt-0.5 block text-[12px] text-ink-400">
                        {item.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="report-nowrap">
                    {t.enums.timelineStatus[
                      item.status as keyof typeof t.enums.timelineStatus
                    ] ?? item.status}
                  </td>
                </tr>
              ))}
            </ReportTable>
          )}
        </ReportSection>

        {/* 8 — Communication ------------------------------------------------ */}
        <ReportSection index={sectionIndex('communication')} title={t.report.section8} visible={view === 'operations' || view === 'general'}>
          <FactGrid>
            <div>
              <Fact label={t.announcement.title}>
                <span className="nums">{data.announcements.total}</span>
              </Fact>
              <Fact label={t.report.urgentCount}>
                <span className="nums">{data.announcements.urgent}</span>
              </Fact>
            </div>
            <div>
              <Fact label={t.report.briefed}>
                <span className="nums">
                  {data.team.briefed} / {data.team.total}
                </span>
              </Fact>
            </div>
          </FactGrid>
        </ReportSection>

        {/*
          8b — what the evening cost.

          Beside the wage bill, never inside it. "What we owe the team" and
          "what the night cost us" are two numbers a closing report has to
          keep apart, or neither of them can be checked against anything.
        */}
        {expenses && (view === 'expenses' || (view === 'general' && expenses.lines.length > 0)) ? (
          <ReportSection index={sectionIndex('expenses')} title={t.expense.title} hint={t.expense.notPay}>
            {expenses.lines.length === 0 ? (
              <p className="report-hint">{t.report.none}</p>
            ) : (
              <>
                <FactGrid>
                  <div>
                    <Fact label={t.report.expenseReportPayroll}>
                      <span className="nums">{formatAmount(data.totalPay)}</span>
                    </Fact>
                    <Fact label={t.report.expenseReportOperating}>
                      <span className="nums">{formatAmount(expenses.total)}</span>
                    </Fact>
                  </div>
                  <div>
                    <Fact label={t.report.expenseReportTotal}>
                      <span className="nums">{formatAmount(data.totalPay + expenses.total)}</span>
                    </Fact>
                    <Fact label={t.expense.count.replace('{n}', '')}>
                      <span className="nums">{expenses.lines.length}</span>
                    </Fact>
                  </div>
                </FactGrid>
                <ReportTable head={[t.expense.description, t.expense.category, t.expense.addedBy, t.expense.amount]}>
                  {expenses.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td>{t.enums.expenseCategory[line.category as ExpenseCategory]}</td>
                      <td style={{ unicodeBidi: 'plaintext' }}>{line.createdByName}</td>
                      <td className="nums">{formatAmount(line.amount)}</td>
                    </tr>
                  ))}
                </ReportTable>
              </>
            )}
          </ReportSection>
        ) : null}

        {/* 9 — Notes and recommendations ------------------------------------ */}
        <ReportSection index={sectionIndex('notes')} title={t.report.section9} visible={view === 'operations' || view === 'general'}>
          <h3 className="text-[13.5px] font-semibold text-ink-200">
            {t.report.recommendations}
          </h3>
          <Statements items={recommendations} />

          <h3 className="mt-4 text-[13.5px] font-semibold text-ink-200">
            {t.report.operationalNotes}
          </h3>
          <ReportNotes
            t={t}
            eventId={eventId}
            value={event.reportNotes}
            canManage={scope.canManage}
          />
        </ReportSection>

        {/* 10 — What the team said ----------------------------------------- */}
        <ReportSection
          index={sectionIndex('survey')}
          title={t.feedback.adminTitle}
          hint={t.feedback.adminAnonymous}
          visible={view === 'survey' || view === 'general'}
        >
          <FactGrid>
            <div>
              <Fact label={t.feedback.answered}>
                <span className="nums">
                  {data.feedback.responses} / {data.feedback.asked}
                </span>
              </Fact>
            </div>
          </FactGrid>

          {data.feedback.responses === 0 ? (
            <p className="report-hint">{t.feedback.adminEmpty}</p>
          ) : data.feedback.scores === null ? (
            /*
             * Enough answered to count, not enough to hide in. Saying so is
             * better than showing an average of two, which is two people's
             * scores with the names peeled off.
             */
            <p className="report-hint">
              {format(t.feedback.adminTooFew, {
                n: data.feedback.responses,
                min: FEEDBACK_MIN_GROUP,
              })}
            </p>
          ) : (
            <>
              <ReportTable head={[t.common.name, t.feedback.average]}>
                {data.feedback.scores.map((row) => (
                  <tr key={row.key}>
                    <td className="font-medium text-ink-100">{questionLabel(t, row.key)}</td>
                    <td className="nums">{row.average} / 5</td>
                  </tr>
                ))}
              </ReportTable>

              {data.feedback.choices?.map((group) => (
                <ReportTable key={group.key} head={[questionLabel(t, group.key), t.common.count]}>
                  {group.counts.map((entry) => (
                    <tr key={entry.value}>
                      <td>{answerLabel(t, group.key, entry.value)}</td>
                      <td className="nums">{entry.count}</td>
                    </tr>
                  ))}
                </ReportTable>
              ))}

              {data.feedback.comments.length > 0 ? (
                <ReportTable head={[questionLabel(t, 'comments'), t.feedback.comments]}>
                  {data.feedback.comments.map((row, i) => (
                    <tr key={`${row.key}-${i}`}>
                      <td className="text-ink-300">{questionLabel(t, row.key)}</td>
                      <td>{row.text}</td>
                    </tr>
                  ))}
                </ReportTable>
              ) : null}
            </>
          )}
        </ReportSection>

        {/* 11 — Sign-off ---------------------------------------------------- */}
        <ReportSection index={sectionIndex('signoff')} title={t.report.section10} visible={view === 'general'}>
          <SignatureBlock
            preparedBy={scope.user.name}
            labels={{
              prepared: t.report.preparedSignature,
              reviewed: t.report.reviewedSignature,
              approved: t.report.approvedSignature,
              name: t.report.nameAndTitle,
              signature: t.report.signature,
            }}
          />
        </ReportSection>
      </article>
    </>
  );
}

/**
 * The question a stored key stands for.
 *
 * The keys are the column names, which are English and terse on purpose — a
 * question reworded next season should not strand the answers given to it
 * this one. This is where they become the sentence people were asked.
 */
function questionLabel(t: Dictionary, key: string): string {
  const labels: Record<string, string> = {
    instructionsClear: t.feedback.qInstructions,
    organisation: t.feedback.qOrganisation,
    supportSpeed: t.feedback.qSupportSpeed,
    overall: t.feedback.qOverall,
    knewDuties: t.feedback.qKnewDuties,
    briefingLength: t.feedback.qBriefing,
    staffing: t.feedback.qStaffing,
    distributionGood: t.feedback.qDistribution,
    unsureMoments: t.feedback.qUnsure,
    unsureWhy: t.feedback.qUnsureWhy,
    knewWhoToAsk: t.feedback.qKnewWho,
    problemKind: t.feedback.qProblemKind,
    problemPrevention: t.feedback.qPrevention,
    guestsInformed: t.feedback.qGuestsInformed,
    guestCommonIssue: t.feedback.qGuestIssue,
    guestImprovement: t.feedback.qGuestImprovement,
    keepDoing: t.feedback.qKeepDoing,
    hardest: t.feedback.qHardest,
    workAgain: t.feedback.qWorkAgain,
    moreResponsibility: t.feedback.qResponsibility,
    freeNote: t.feedback.qFreeNote,
    comments: t.feedback.comments,
  };
  return labels[key] ?? key;
}

/** The answer a stored code stands for, in the asker's language. */
function answerLabel(t: Dictionary, question: string, value: string): string {
  const sets: Record<string, Record<string, string>> = {
    knewDuties: t.enums.feedbackDegree,
    distributionGood: t.enums.feedbackDegree,
    knewWhoToAsk: t.enums.feedbackDegree,
    guestsInformed: t.enums.feedbackDegree,
    briefingLength: t.enums.feedbackBriefing,
    staffing: t.enums.feedbackStaffing,
    unsureMoments: t.enums.feedbackUnsure,
    problemKind: t.enums.feedbackProblem,
    workAgain: t.enums.feedbackAgain,
    moreResponsibility: t.enums.feedbackResponsibility,
  };
  return sets[question]?.[value] ?? value;
}
