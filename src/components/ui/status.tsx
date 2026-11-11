/**
 * Status presentation. Every badge pairs a colour with a dot shape AND a word,
 * so meaning never depends on colour alone (spec §33 / §35).
 */
import type { ReactNode } from 'react';

import type {
  AssignmentStatus,
  AttendanceStatus,
  EventStatus,
  IssuePriority,
  IssueStatus,
  Priority,
  StaffingLevel,
  TimelineStatus,
} from '@/lib/constants';

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'brand';

const TONE: Record<Tone, string> = {
  ok: 'border-ok/45 bg-ok/12 text-ok-text',
  warn: 'border-warn/45 bg-warn/12 text-warn-text',
  crit: 'border-crit/45 bg-crit/12 text-crit-text',
  info: 'border-info/45 bg-info/12 text-info-text',
  brand: 'border-brand-500/45 bg-brand-500/12 text-brand-300',
  neutral: 'border-ink-600 bg-ink-800 text-ink-300',
};

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
  info: 'bg-info',
  brand: 'bg-brand-500',
  neutral: 'bg-ink-400',
};

export function Badge({
  tone = 'neutral',
  children,
  dot = true,
  pulse = false,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={`chip ${TONE[tone]} ${className}`}>
      {dot ? (
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]} ${
            pulse ? 'animate-pulseSoft' : ''
          }`}
        />
      ) : null}
      {children}
    </span>
  );
}

/**
 * The tone of the one stage that is shown but never stored — see
 * `displayStage`. Warn rather than crit: the night went fine, the paperwork
 * did not, and a red badge for a finished event reads as a disaster.
 */
export const needsClosingTone: Tone = 'warn';

export const eventStatusTone: Record<EventStatus, Tone> = {
  DRAFT: 'neutral',
  PLANNING: 'info',
  READY: 'brand',
  LIVE: 'ok',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
};


export const attendanceTone: Record<AttendanceStatus, Tone> = {
  PENDING: 'neutral',
  PRESENT: 'ok',
  LATE: 'warn',
  ABSENT: 'crit',
  EXCUSED: 'info',
};

export const assignmentTone: Record<AssignmentStatus, Tone> = {
  ASSIGNED: 'brand',
  CONFIRMED: 'ok',
  CHANGED: 'warn',
  CANCELLED: 'neutral',
};

export const priorityTone: Record<Priority, Tone> = {
  NORMAL: 'neutral',
  IMPORTANT: 'warn',
  URGENT: 'crit',
};

export const issuePriorityTone: Record<IssuePriority, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warn',
  CRITICAL: 'crit',
};

export const issueStatusTone: Record<IssueStatus, Tone> = {
  OPEN: 'crit',
  ACKNOWLEDGED: 'warn',
  IN_PROGRESS: 'info',
  RESOLVED: 'ok',
  CLOSED: 'neutral',
};

export const timelineTone: Record<TimelineStatus, Tone> = {
  UPCOMING: 'neutral',
  ACTIVE: 'ok',
  COMPLETED: 'info',
  CANCELLED: 'neutral',
};

export const staffingTone: Record<StaffingLevel, Tone> = {
  UNDERSTAFFED: 'crit',
  ADEQUATE: 'ok',
  OVERSTAFFED: 'warn',
};

/**
 * "3 / 5 — needs 2 more". The number, the word and the colour all say the
 * same thing, which is what a Team Leader needs to read at a glance.
 */
export function StaffingIndicator({
  assigned,
  required,
  level,
  label,
  detail,
  compact = false,
}: {
  assigned: number;
  required: number;
  level: StaffingLevel;
  label: string;
  detail?: string;
  compact?: boolean;
}) {
  const ratio = required > 0 ? Math.min(assigned / required, 1) : assigned > 0 ? 1 : 0;
  const barTone =
    level === 'UNDERSTAFFED' ? 'bg-crit' : level === 'OVERSTAFFED' ? 'bg-warn' : 'bg-ok';

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex items-center justify-between gap-3">
        <span className="nums text-[15px] font-semibold text-ink-100">
          {assigned} / {required}
        </span>
        <Badge tone={staffingTone[level]}>{label}</Badge>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-ink-750"
        role="img"
        aria-label={`${assigned} / ${required} — ${label}`}
      >
        <div
          className={`h-full rounded-full ${barTone} transition-[width]`}
          style={{ width: `${Math.max(ratio * 100, assigned > 0 ? 6 : 0)}%` }}
        />
      </div>
      {detail ? <p className="text-[12.5px] text-ink-400">{detail}</p> : null}
    </div>
  );
}
