import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { surveyOpens, surveys } from '@/db/schema';
import type { SessionUser } from '@/server/auth/session';
import { getT } from '@/lib/i18n/server';
import { format } from '@/lib/i18n';
import { formatDateTime } from '@/lib/time';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/status';
import { ConfirmSubmit } from '@/components/ui/client';
import { deleteSurveyAction } from '@/server/actions/surveys';

import { SurveyForm } from './SurveyForm';
import { SurveyChase } from './SurveyChase';
import { notOpenedBySurvey } from '@/server/services/surveys';
import { resolveBaseUrl, toWhatsAppNumber } from '@/server/services/notify';

/** One page for admins and team leaders: post a questionnaire, see who opened it. */
export async function SurveysPage({ user }: { user: SessionUser }) {
  const { t, locale } = await getT();
  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      url: surveys.url,
      note: surveys.note,
      sentTo: surveys.sentTo,
      expiresAt: surveys.expiresAt,
      createdAt: surveys.createdAt,
      createdById: surveys.createdById,
      createdByName: surveys.createdByName,
      opened: sql<number>`(select count(*) from "survey_opens" so where so."survey_id" = "surveys"."id")`,
    })
    .from(surveys)
    .orderBy(desc(surveys.createdAt))
    .limit(50);
  const now = Date.now();
  const [missing, baseUrl] = await Promise.all([
    notOpenedBySurvey(rows.map((row) => row.id)),
    resolveBaseUrl(),
  ]);
  const chaseList = (row: (typeof rows)[number]) =>
    (missing.get(row.id) ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      whatsapp: toWhatsAppNumber(person.phone),
      message: format(t.surveys.chaseMessage, {
        name: person.name,
        title: row.title,
        url: `${baseUrl}/me/survey/${row.id}`,
      }),
    }));

  return (
    <>
      <PageHeader title={t.surveys.title} subtitle={t.surveys.subtitle} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t.surveys.formTitle} bodyClassName="p-5">
          <SurveyForm t={t} />
        </Panel>
        <Panel title={t.surveys.list} bodyClassName="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13.5px] text-ink-500">{t.surveys.empty}</p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {rows.map((row) => {
                const expired = row.expiresAt ? row.expiresAt.getTime() < now : false;
                const mine = user.role === 'ADMIN' || row.createdById === user.id;
                return (
                  <li key={row.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-ink-100">{row.title}</p>
                      <Badge tone={expired ? 'neutral' : 'ok'}>
                        {format(t.surveys.opened, { opened: row.opened, sent: row.sentTo })}
                      </Badge>
                    </div>
                    {row.note ? <p className="text-[13px] text-ink-300">{row.note}</p> : null}
                    <p className="text-[12px] text-ink-500">
                      {formatDateTime(row.createdAt, locale)} · {t.surveys.by} {row.createdByName}
                      {row.expiresAt
                        ? ` · ${expired ? t.surveys.expired : format(t.surveys.expires, { date: formatDateTime(row.expiresAt, locale) })}`
                        : ''}
                    </p>
                    {!expired ? <SurveyChase t={t} people={chaseList(row)} /> : null}
                    <div className="flex items-center gap-2">
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                        {t.surveys.open}
                      </a>
                      {mine ? (
                        <form action={deleteSurveyAction}>
                          <input type="hidden" name="surveyId" value={row.id} />
                          <ConfirmSubmit className="btn-ghost btn-sm text-crit-text" message={t.surveys.removeConfirm}>
                            {t.surveys.remove}
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
