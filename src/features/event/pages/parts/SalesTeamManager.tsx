'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveSalesAssignmentAction } from '@/server/actions/sales-team';
import { idle } from '@/server/actions/types';
import { SubmitButton } from '@/components/ui/client';
import type { Locale } from '@/lib/i18n';

export type SalesTeamRow = {
  eventMemberId: string;
  name: string;
  status: string;
  salesRole: string | null;
  payAmount: number | null;
};

const labels = {
  ar: {
    title: 'فريق المبيعات',
    hint: 'تكليف خاص بهذه المباراة. أجور المبيعات منفصلة عن أجر البروموتر بالحفلات.',
    role: 'الدور',
    rate: 'الأجر لهذه المباراة (د.ع)',
    none: 'بدون تكليف مبيعات',
    SALES_MANAGER: 'مسؤول المبيعات',
    SALES_ASSISTANT_MANAGER: 'مساعد مسؤول المبيعات',
    SALES_EMPLOYEE: 'موظف مبيعات',
    SALES_SUPPORT: 'إسناد مبيعات — أجر البروموتر',
    save: 'حفظ التكليف',
    saved: 'تم حفظ تكليف المبيعات',
    error: 'تعذر حفظ التكليف',
    empty: 'أضف الشخص إلى فريق الفعالية أولاً، ثم عيّنه هنا.',
  },
  en: {
    title: 'Sales Team',
    hint: 'Match-only assignment. Sales pay stays separate from promoter pay at concerts.',
    role: 'Role',
    rate: 'Pay for this match (IQD)',
    none: 'No sales assignment',
    SALES_MANAGER: 'Sales Manager',
    SALES_ASSISTANT_MANAGER: 'Assistant Sales Manager',
    SALES_EMPLOYEE: 'Sales Employee',
    SALES_SUPPORT: 'Sales Support — promoter rate',
    save: 'Save assignment',
    saved: 'Sales assignment saved',
    error: 'Could not save the assignment',
    empty: 'Add the person to the event team first, then assign them here.',
  },
} as const;

function SalesPerson({ eventId, member, locale }: {
  eventId: string;
  member: SalesTeamRow;
  locale: Locale;
}) {
  const t = labels[locale === 'ar' ? 'ar' : 'en'];
  const router = useRouter();
  const [state, action] = useActionState(saveSalesAssignmentAction, idle);
  const [selectedRole, setSelectedRole] = useState(member.salesRole ?? '');
  const [rate, setRate] = useState(
    member.salesRole === 'SALES_SUPPORT' ? '' : String(member.payAmount ?? ''),
  );

  useEffect(() => {
    if (state.status === 'success') router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="grid gap-2 rounded-xl border border-ink-700 p-3 sm:grid-cols-[minmax(150px,1fr)_minmax(190px,1fr)_150px_auto] sm:items-end">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventMemberId" value={member.eventMemberId} />
      <div className="text-[14px] font-semibold text-ink-100">{member.name}</div>
      <label className="space-y-1 text-[12px] text-ink-400">
        <span>{t.role}</span>
        <select
          className="field w-full"
          name="salesRole"
          value={selectedRole}
          onChange={(event) => {
            const next = event.target.value;
            setSelectedRole(next);
            setRate(next === 'SALES_EMPLOYEE' ? '35000' : next && next !== 'SALES_SUPPORT' ? '50000' : '');
          }}
        >
          <option value="">{t.none}</option>
          <option value="SALES_MANAGER">{t.SALES_MANAGER}</option>
          <option value="SALES_ASSISTANT_MANAGER">{t.SALES_ASSISTANT_MANAGER}</option>
          <option value="SALES_EMPLOYEE">{t.SALES_EMPLOYEE}</option>
          <option value="SALES_SUPPORT">{t.SALES_SUPPORT}</option>
        </select>
      </label>
      <label className="space-y-1 text-[12px] text-ink-400">
        <span>{t.rate}</span>
        <input
          className="field w-full nums"
          type="number"
          name="payAmount"
          min="0"
          max="1000000"
          step="1000"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          placeholder={selectedRole === 'SALES_EMPLOYEE' ? '35,000' : '50,000'}
          disabled={selectedRole === 'SALES_SUPPORT' || !selectedRole}
        />
      </label>
      <SubmitButton className="btn-secondary btn-sm">{t.save}</SubmitButton>
      {state.status === 'success' ? <p className="text-[12px] text-ok-text sm:col-span-full">{t.saved}</p> : null}
      {state.status === 'error' ? <p className="text-[12px] text-crit-text sm:col-span-full">{state.message || t.error}</p> : null}
    </form>
  );
}

export function SalesTeamManager({
  eventId,
  members,
  locale,
}: {
  eventId: string;
  members: SalesTeamRow[];
  locale: Locale;
}) {
  const t = labels[locale === 'ar' ? 'ar' : 'en'];
  return (
    <section className="panel mt-5 space-y-3 p-4">
      <div>
        <h2 className="text-[17px] font-bold text-ink-100">{t.title}</h2>
        <p className="mt-1 text-[13px] text-ink-400">{t.hint}</p>
      </div>
      {members.length ? (
        <div className="space-y-2">
          {members.map((member) => <SalesPerson key={member.eventMemberId} eventId={eventId} member={member} locale={locale} />)}
        </div>
      ) : <p className="text-[13px] text-ink-400">{t.empty}</p>}
    </section>
  );
}
