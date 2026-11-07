import { loadManagedEventPage } from '@/features/event/workspace';
import { listEventAudit } from '@/server/services/audit';
import { PageHeader, Panel } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { Badge } from '@/components/ui/status';
import { IconHistory } from '@/components/ui/icons';
import { formatDateTime } from '@/lib/time';
import type { AuditAction, AuditEntity } from '@/lib/constants';

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read-only for operational users — the log is never edited from the UI. */
export async function EventActivityPage({ eventId }: { eventId: string }) {
  const { scope, locale, t } = await loadManagedEventPage(eventId);
  const allRows = await listEventAudit(eventId, 300);
  const rows = scope.user.role === 'ADMIN'
    ? allRows
    : allRows.filter((row) => {
        const sensitive = (value: string | null) =>
          Object.keys(parseJson(value) ?? {}).some((key) =>
            /pay|credit|amount|total|fee|cost|expense|rate|salary|wage/i.test(key),
          );
        return !sensitive(row.oldValues) && !sensitive(row.newValues);
      });

  return (
    <>
      <PageHeader title={t.audit.title} subtitle={t.audit.subtitle} />

      <div className="mb-4">
        <Notice tone="info">{t.audit.readOnly}</Notice>
      </div>

      <Panel bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={t.audit.empty}
            hint={t.audit.emptyHint}
            icon={<IconHistory width={20} height={20} />}
          />
        ) : (
          <ol className="divide-y divide-ink-800">
            {rows.map((row) => {
              const oldValues = parseJson(row.oldValues);
              const newValues = parseJson(row.newValues);
              return (
                <li key={row.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] leading-6 text-ink-100">{row.summary}</p>
                      <p className="mt-0.5 text-[12px] text-ink-500">
                        {row.actorName} ·{' '}
                        <span className="nums">
                          {formatDateTime(row.createdAt, locale)}
                        </span>
                        {row.entityLabel ? ` · ${row.entityLabel}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="neutral" dot={false}>
                        {t.enums.auditEntity[row.entity as AuditEntity]}
                      </Badge>
                      <Badge
                        tone={
                          row.action === 'REASSIGN'
                            ? 'warn'
                            : row.action === 'DELETE'
                              ? 'crit'
                              : row.action === 'CREATE' || row.action === 'ASSIGN'
                                ? 'brand'
                                : 'neutral'
                        }
                      >
                        {t.enums.auditAction[row.action as AuditAction]}
                      </Badge>
                    </div>
                  </div>

                  {oldValues || newValues ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                      {oldValues ? (
                        <span className="text-ink-500">
                          {Object.entries(oldValues)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </span>
                      ) : null}
                      {oldValues && newValues ? (
                        <span aria-hidden className="text-ink-600">
                          →
                        </span>
                      ) : null}
                      {newValues ? (
                        <span className="text-ink-300">
                          {Object.entries(newValues)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {row.reason ? (
                    <p className="mt-1.5 text-[12.5px] leading-5 text-ink-400">
                      {t.common.reason}: {row.reason}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </>
  );
}
