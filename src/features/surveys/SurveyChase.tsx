'use client';

import { useState } from 'react';

import type { Dictionary } from '@/lib/i18n';
import { format } from '@/lib/i18n';

export type ChasePerson = { id: string; name: string; whatsapp: string | null; message: string };

/**
 * The people who have not opened a questionnaire, and a WhatsApp nudge for
 * each. A browser only opens a chat straight from a click, so a run is one
 * press per person — but the next name is always under the same button.
 */
export function SurveyChase({ t, people }: { t: Dictionary; people: ChasePerson[] }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const reachable = people.filter((p) => p.whatsapp);
  const next = reachable.find((p) => !sent.has(p.id)) ?? null;

  function send(person: ChasePerson) {
    if (!person.whatsapp) return;
    window.open(
      `https://wa.me/${person.whatsapp}?text=${encodeURIComponent(person.message)}`,
      '_blank',
      'noopener,noreferrer',
    );
    setSent((prev) => new Set(prev).add(person.id));
  }

  if (people.length === 0) {
    return <p className="text-[12.5px] text-ok-text">✓ {t.surveys.allOpened}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
          {format(t.surveys.notOpened, { n: people.length })} {open ? '▴' : '▾'}
        </button>
        {next ? (
          <button type="button" className="btn-primary btn-sm" onClick={() => send(next)}>
            {sent.size === 0 ? t.surveys.chaseAll : format(t.surveys.chaseNext, { name: next.name })}
          </button>
        ) : reachable.length > 0 ? (
          <span className="text-[12.5px] text-ok-text">✓ {t.surveys.chaseDone}</span>
        ) : null}
      </div>
      {open ? (
        <ul className="divide-y divide-ink-800 rounded-card border border-ink-800">
          {people.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-[13.5px] text-ink-200">
                {sent.has(person.id) ? '✓ ' : ''}
                {person.name}
              </span>
              {person.whatsapp ? (
                <button type="button" className="btn-ghost btn-sm" onClick={() => send(person)}>
                  {t.surveys.chaseOne}
                </button>
              ) : (
                <span className="text-[12px] text-warn-text">{t.notify.noPhone}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
