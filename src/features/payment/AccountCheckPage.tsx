import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { PageHeader, Panel, StatTile } from '@/components/ui/panel';
import { EmptyState, Notice } from '@/components/ui/states';
import { accountCheck, type AccountIssue } from '@/server/services/account-check';

/**
 * The roster, checked against the company's register.
 *
 * Read before the file is wanted, not while it is being refused. Everything
 * here is a reading — nothing on this screen changes a row — and each entry
 * links to the person it is about, because the fix is always on their page.
 */
export async function AccountCheckPage() {
  const { t } = await getT();
  const data = await accountCheck();
  const c = t.accountCheck;

  const group = (kind: AccountIssue['kind']) =>
    data.issues.filter((issue) => issue.kind === kind);

  const blocking = group('NOT_REGISTERED').length + group('NO_CARD').length;

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        action={
          <Link href="/admin/payments" className="btn-ghost btn-sm">
            {t.payment.nav}
          </Link>
        }
      />

      {!data.template ? (
        <Notice tone="warn">{t.payment.templateNone}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label={c.checked} value={data.checked} />
            <StatTile
              label={c.clean}
              value={data.clean}
              tone={data.clean === data.checked ? 'ok' : 'neutral'}
            />
            <StatTile
              label={c.blocking}
              value={blocking}
              tone={blocking > 0 ? 'crit' : 'ok'}
              hint={c.blockingHint}
            />
          </div>

          {data.issues.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={c.allGood} hint={c.allGoodHint} />
            </div>
          ) : null}

          <Section
            title={c.notRegistered}
            why={c.notRegisteredWhy}
            rows={group('NOT_REGISTERED')}
            show={(issue) =>
              issue.kind === 'NOT_REGISTERED' ? (
                <Row
                  key={issue.id}
                  id={issue.id}
                  name={issue.name}
                  right={<span className="nums text-crit-text">{issue.card}</span>}
                  note={issue.code}
                />
              ) : null
            }
          />

          <Section
            title={c.noCard}
            why={c.noCardWhy}
            rows={group('NO_CARD')}
            show={(issue) =>
              issue.kind === 'NO_CARD' ? (
                <Row key={issue.id} id={issue.id} name={issue.name} note={issue.code} />
              ) : null
            }
          />

          <Section
            title={c.duplicateName}
            why={c.duplicateNameWhy}
            rows={group('DUPLICATE_NAME')}
            show={(issue) =>
              issue.kind === 'DUPLICATE_NAME' ? (
                <li key={issue.ids.join()} className="px-4 py-2.5">
                  <span
                    className="text-[13.5px] font-semibold text-ink-100"
                    style={{ unicodeBidi: 'plaintext' }}
                  >
                    {issue.name}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-2">
                    {issue.ids.map((id, i) => (
                      <Link
                        key={id}
                        href={`/admin/team/${id}`}
                        className="nums text-[12.5px] text-brand-300 underline"
                      >
                        {issue.codes[i]}
                      </Link>
                    ))}
                  </span>
                </li>
              ) : null
            }
          />

          <Section
            title={c.cardShared}
            why={c.cardSharedWhy}
            rows={group('CARD_SHARED')}
            show={(issue) =>
              issue.kind === 'CARD_SHARED' ? (
                <li key={issue.card} className="flex flex-wrap gap-x-3 px-4 py-2.5">
                  <span className="nums text-[13px] text-ink-400">{issue.card}</span>
                  <span className="text-[13.5px] text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
                    {issue.names.join(' + ')}
                  </span>
                </li>
              ) : null
            }
          />

          <Section
            title={c.registerSpacing}
            why={c.registerSpacingWhy}
            rows={group('REGISTER_SPACING')}
            show={(issue) =>
              issue.kind === 'REGISTER_SPACING' ? (
                <li key={issue.row} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5">
                  {/*
                    Quoted, because the whole point is a space at the end that
                    is invisible everywhere else — including here, unless it
                    has something to sit against.
                  */}
                  <span className="text-[13.5px] text-ink-100" style={{ unicodeBidi: 'plaintext' }}>
                    «{issue.name}»
                  </span>
                  <span className="nums text-[12.5px] text-ink-400">{issue.card}</span>
                  <span className="nums text-[12px] text-ink-500">Promoters!A{issue.row}</span>
                </li>
              ) : null
            }
          />

          <Section
            title={c.nameDiffers}
            why={c.nameDiffersWhy}
            rows={group('NAME_DIFFERS')}
            show={(issue) =>
              issue.kind === 'NAME_DIFFERS' ? (
                <Row
                  key={issue.id}
                  id={issue.id}
                  name={issue.name}
                  right={
                    <span className="text-[13px] text-ink-300" style={{ unicodeBidi: 'plaintext' }}>
                      ← {issue.theirs.join(' / ')}
                    </span>
                  }
                  note={issue.card}
                />
              ) : null
            }
          />
        </>
      )}
    </>
  );
}

function Section({
  title,
  why,
  rows,
  show,
}: {
  title: string;
  why: string;
  rows: AccountIssue[];
  show: (issue: AccountIssue) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <Panel title={`${title} — ${rows.length}`} className="mt-4" bodyClassName="p-0">
      <p className="border-b border-ink-800 px-4 py-3 text-[12.5px] leading-6 text-ink-400">
        {why}
      </p>
      <ul className="divide-y divide-ink-800">{rows.map(show)}</ul>
    </Panel>
  );
}

function Row({
  id,
  name,
  right,
  note,
}: {
  id: string;
  name: string;
  right?: React.ReactNode;
  note?: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
      <Link
        href={`/admin/team/${id}`}
        className="text-[13.5px] font-semibold text-ink-100 underline decoration-ink-700 underline-offset-4"
        style={{ unicodeBidi: 'plaintext' }}
      >
        {name}
      </Link>
      <span className="flex items-center gap-3">
        {note ? <span className="nums text-[12px] text-ink-500">{note}</span> : null}
        {right}
      </span>
    </li>
  );
}
