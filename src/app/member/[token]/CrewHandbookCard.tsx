import type { Dictionary } from '@/lib/i18n';

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pe-5 text-[13px] leading-5 text-ink-300">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export function CrewHandbookCard({ t }: { t: Dictionary }) {
  const guide = t.member.crewHandbook;
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer list-none">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-[15px] font-bold text-ink-100">{t.member.crewHandbookTitle}</span>
            <span className="mt-1 block text-[12.5px] leading-5 text-ink-400">{t.member.crewHandbookIntro}</span>
          </span>
          <span aria-hidden className="text-brand-300">⌄</span>
        </span>
      </summary>

      <div className="mt-4 space-y-4 border-t border-ink-700 pt-4">
        <section className="space-y-2">
          <h3 className="text-[13.5px] font-semibold text-ink-100">{guide.scanning.title}</h3>
          <h4 className="text-[12.5px] font-semibold text-ink-300">{guide.scanning.beforeTitle}</h4>
          <List items={guide.scanning.before} />
          <h4 className="pt-1 text-[12.5px] font-semibold text-ink-300">{guide.scanning.duringTitle}</h4>
          <List items={guide.scanning.during} />
          <h4 className="pt-1 text-[12.5px] font-semibold text-ink-300">{guide.scanning.issueTitle}</h4>
          <List items={guide.scanning.issue} />
        </section>

        <section className="space-y-2 border-t border-ink-700 pt-4">
          <h3 className="text-[13.5px] font-semibold text-ink-100">{guide.wristbands.title}</h3>
          <List items={guide.wristbands.items} />
        </section>

        <section className="space-y-2 border-t border-ink-700 pt-4">
          <h3 className="text-[13.5px] font-semibold text-ink-100">{guide.guests.title}</h3>
          <List items={guide.guests.items} />
        </section>

        <section className="space-y-2 border-t border-ink-700 pt-4">
          <h3 className="text-[13.5px] font-semibold text-ink-100">{guide.conduct.title}</h3>
          <List items={guide.conduct.notAllowed} />
          <h4 className="pt-1 text-[12.5px] font-semibold text-ink-300">{guide.conduct.sosTitle}</h4>
          <ol className="list-decimal space-y-1.5 pe-5 text-[13px] leading-5 text-ink-300">
            {guide.conduct.sosSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <List items={guide.conduct.sosDont} />
        </section>

        <section className="space-y-2 border-t border-ink-700 pt-4">
          <h3 className="text-[13.5px] font-semibold text-ink-100">{guide.principles.title}</h3>
          <List items={guide.principles.items} />
        </section>

        <a href="/docs/crew-handbook.pdf" download className="btn-primary btn-sm inline-flex">
          {t.member.crewHandbookDownload}
        </a>
      </div>
    </details>
  );
}
