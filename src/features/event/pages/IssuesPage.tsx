import { aliasedTable, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { gates, issues, users, workingPoints } from '@/db/schema';
import { escalateOverdue } from '@/server/services/issue-routing';
import { isOverdue, minutesLate } from '@/lib/issue-sla';

/**
 * The same users table, joined twice: once for whoever closed the report and
 * once for whoever holds it now. They are different questions and frequently
 * different people, so they need different aliases.
 */
const assignee = aliasedTable(users, 'assignee');
import { loadEventPage } from '@/features/event/workspace';
import { PageHeader } from '@/components/ui/panel';

import { IssueManager } from './parts/IssueManager';

export async function EventIssuesPage({ eventId }: { eventId: string }) {
  const { scope, locale, t } = await loadEventPage(eventId);

  const [rows, gateRows, wpRows] = await Promise.all([
    db
      .select({
        id: issues.id,
        type: issues.type,
        description: issues.description,
        priority: issues.priority,
        status: issues.status,
        gateId: issues.gateId,
        gateName: gates.name,
        workingPointName: workingPoints.name,
        reporterName: issues.reporterName,
        createdAt: issues.createdAt,
        resolvedAt: issues.resolvedAt,
        resolvedByName: users.name,
        resolutionNote: issues.resolutionNote,
        acknowledgedAt: issues.acknowledgedAt,
        dueAt: issues.dueAt,
        escalatedAt: issues.escalatedAt,
        reopenCount: issues.reopenCount,
        assigneeName: assignee.name,
      })
      .from(issues)
      .leftJoin(gates, eq(issues.gateId, gates.id))
      .leftJoin(workingPoints, eq(issues.workingPointId, workingPoints.id))
      .leftJoin(users, eq(issues.resolvedById, users.id))
      .leftJoin(assignee, eq(issues.assigneeUserId, assignee.id))
      .where(eq(issues.eventId, eventId))
      .orderBy(desc(issues.createdAt)),
    db
      .select({ id: gates.id, name: gates.name })
      .from(gates)
      .where(eq(gates.eventId, eventId)),
    db
      .select({ id: workingPoints.id, name: workingPoints.name })
      .from(workingPoints)
      .where(eq(workingPoints.eventId, eventId)),
  ]);

  const visible = scope.gateId ? rows.filter((r) => r.gateId === scope.gateId) : rows;

  /*
   * Escalation happens here, when somebody looks.
   *
   * There is no scheduler on this host, and a cron job would buy nothing a
   * person would recognise as escalation: a report nobody is looking at has
   * not been escalated in any useful sense. So the moment this screen loads,
   * anything that has run past its target unanswered is handed to the team
   * leader and flagged — once, because `escalatedAt` latches it.
   */
  const overdue = visible.filter((r) => isOverdue(r));
  if (overdue.length > 0) {
    await escalateOverdue(
      eventId,
      overdue.filter((r) => !r.escalatedAt).map((r) => r.id),
    );
  }

  return (
    <>
      <PageHeader title={t.issue.title} subtitle={t.issue.subtitle} />
      <IssueManager
        t={t}
        locale={locale}
        eventId={eventId}
        issues={visible.map((r) => ({
          id: r.id,
          type: r.type,
          description: r.description,
          priority: r.priority,
          status: r.status,
          locationName: r.gateName ?? r.workingPointName ?? null,
          reporterName: r.reporterName,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          resolvedByName: r.resolvedByName,
          resolutionNote: r.resolutionNote,
          assigneeName: r.assigneeName,
          dueAt: r.dueAt,
          overdue: isOverdue(r),
          minutesLate: isOverdue(r) ? minutesLate(r.dueAt) : 0,
          escalated: r.escalatedAt !== null,
          reopenCount: r.reopenCount,
        }))}
        gates={scope.gateId ? gateRows.filter((g) => g.id === scope.gateId) : gateRows}
        workingPoints={scope.gateId ? [] : wpRows}
      />
    </>
  );
}
