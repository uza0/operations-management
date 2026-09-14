import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { gates, issues, users, workingPoints } from '@/db/schema';
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
      })
      .from(issues)
      .leftJoin(gates, eq(issues.gateId, gates.id))
      .leftJoin(workingPoints, eq(issues.workingPointId, workingPoints.id))
      .leftJoin(users, eq(issues.resolvedById, users.id))
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
        }))}
        gates={scope.gateId ? gateRows.filter((g) => g.id === scope.gateId) : gateRows}
        workingPoints={scope.gateId ? [] : wpRows}
      />
    </>
  );
}
