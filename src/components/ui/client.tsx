'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

import { IconClose, IconCopy, IconCheckCircle, IconGlobe } from './icons';

/* -------------------------------------------------------------------------- */
/* Dictionary context — client components read translations from here.         */
/* -------------------------------------------------------------------------- */

import type { Dictionary } from '@/lib/i18n';

const DictCtx = createContext<Dictionary | null>(null);

export function DictionaryProvider({
  dict,
  children,
}: {
  dict: Dictionary;
  children: ReactNode;
}) {
  return <DictCtx.Provider value={dict}>{children}</DictCtx.Provider>;
}

export function useDict(): Dictionary {
  const dict = useContext(DictCtx);
  if (!dict) throw new Error('useDict must be used inside <DictionaryProvider>');
  return dict;
}

/* -------------------------------------------------------------------------- */
/* The handful of words a confirmation needs                                   */
/* -------------------------------------------------------------------------- */

/**
 * Three strings, carried separately from the dictionary.
 *
 * A confirmation can be raised from anywhere, including pages that mount no
 * dictionary of their own, so the words have to be available everywhere. The
 * whole dictionary is far too large to hand to the browser on every page for
 * the sake of three words, so only the three travel, from the root layout.
 *
 * The defaults are Arabic because the app is, and because a missing provider
 * must still produce a usable button rather than an empty one.
 */
export type ConfirmWords = { title: string; confirm: string; cancel: string };

const WORDS: ConfirmWords = { title: 'تأكيد الإجراء', confirm: 'تأكيد', cancel: 'إلغاء' };

const WordsCtx = createContext<ConfirmWords>(WORDS);

export function ConfirmWordsProvider({
  words,
  children,
}: {
  words: ConfirmWords;
  children: ReactNode;
}) {
  return <WordsCtx.Provider value={words}>{children}</WordsCtx.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn-primary',
  disabled,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  /**
   * Set both to let several buttons share one form and say which was pressed —
   * the pressed button's name/value is submitted with the rest of the fields.
   */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending || disabled}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * Destructive actions always confirm first (spec §46 / §64). Harmless actions
 * never do.
 *
 * The question is asked in the app's own dialog rather than the browser's.
 * The browser's is quicker to write and worse in every way that matters here:
 * it arrives in the browser's language and not the page's, it cannot be read
 * right-to-left, it names the site at the top as though the page were trying
 * something, and on a phone it is a grey system sheet in the middle of a
 * dark screen. The question itself is the same; only its manners change.
 *
 * The form is submitted afterwards through the pressed button, so a form with
 * several buttons still knows which one was pressed.
 */
export function ConfirmSubmit({
  children,
  message,
  className = 'btn-danger',
  name,
  value,
}: {
  children: ReactNode;
  message: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="submit"
        name={name}
        value={value}
        className={className}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={asking}
        message={message}
        danger={className.includes('danger')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          const el = button.current;
          /* Submitted through the button so its name and value go with it. */
          el?.form?.requestSubmit(el);
        }}
      />
    </>
  );
}

/**
 * The question itself: a line of text and two answers.
 *
 * Deliberately bare. A confirmation is read in a second and answered in two,
 * so it carries no icon, no heading of its own beyond the one word, and
 * nothing to scroll. The dangerous answer wears the dangerous colour and the
 * safe one is placed first, where a thumb reaches it without aiming.
 */
export function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  danger = true,
  confirmLabel,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  confirmLabel?: string;
}) {
  const words = useContext(WordsCtx);
  return (
    <Dialog open={open} onClose={onCancel} title={words.title}>
      <p className="text-[14px] leading-7 text-ink-200">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {words.cancel}
        </button>
        <button
          type="button"
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
        >
          {confirmLabel ?? words.confirm}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * The same question, for code that has to wait for the answer.
 *
 * `window.confirm` stops the page until it is answered, which is what makes
 * it so easy to write — `if (!confirm(...)) return;` and the rest of the
 * function carries on. Nothing in a browser can block like that honestly, so
 * the answer arrives as a promise instead and the caller awaits it. Returns
 * the asking function and the dialog to render; put the second anywhere in
 * the component's own markup.
 */
export function useConfirm(): [(message: string) => Promise<boolean>, ReactNode] {
  const [question, setQuestion] = useState<{
    message: string;
    settle: (answer: boolean) => void;
  } | null>(null);

  const ask = (message: string) =>
    new Promise<boolean>((resolve) => setQuestion({ message, settle: resolve }));

  const answer = (value: boolean) => {
    question?.settle(value);
    setQuestion(null);
  };

  return [
    ask,
    <ConfirmDialog
      key="confirm"
      open={question !== null}
      message={question?.message ?? ''}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />,
  ];
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  className = 'btn-secondary btn-sm',
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  /*
   * The clipboard is refused often enough to need a way out: an insecure
   * origin, a browser that wants a fresher gesture, a webview that simply
   * does not have one. The way out is to put the text on the screen, already
   * selected, so it can be copied by hand.
   */
  const [manual, setManual] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            setManual(true);
            return;
          }
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }}
      >
        {done ? <IconCheckCircle width={15} height={15} /> : <IconCopy width={15} height={15} />}
        {done ? copiedLabel : label}
      </button>

      <Dialog open={manual} onClose={() => setManual(false)} title={label}>
        <input
          ref={field}
          className="field w-full text-center"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
        />
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                      */
/* -------------------------------------------------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>(
      'input,select,textarea,button:not([data-close])',
    )?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portalled to <body> for the same reason the navigation drawer is: any
  // ancestor with a filter, transform or backdrop-filter would become the
  // containing block for this fixed overlay and collapse it to that element's
  // box. Out here it can only ever be the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`panel max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-card ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="panel-head sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-semibold text-ink-100">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-[12.5px] text-ink-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="btn-ghost btn-sm"
            aria-label="close"
          >
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Button + dialog in one piece, for the many "open a form" cases. */
export function DialogButton({
  label,
  title,
  description,
  children,
  className = 'btn-primary',
  wide = false,
  icon,
}: {
  label: ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  wide?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        wide={wide}
      >
        {children(() => setOpen(false))}
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Locale switcher                                                             */
/* -------------------------------------------------------------------------- */

export function LocaleSwitcher({
  locale,
  labels,
}: {
  locale: 'ar' | 'en';
  labels: { ar: string; en: string };
}) {
  const router = useRouter();
  const next = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      onClick={() => {
        document.cookie = `ops_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
        router.refresh();
      }}
      title={labels[next]}
    >
      <IconGlobe width={16} height={16} />
      <span>{labels[next]}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

export function Toggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`btn btn-sm ${
        pressed
          ? 'bg-brand-600 text-white hover:bg-brand-500'
          : 'border border-ink-600 bg-ink-800 text-ink-300 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  );
}

/** Auto-submitting filter control — keeps filter UI free of extra buttons. */
export function AutoSubmit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      onChange={() => ref.current?.requestSubmit()}
      className="contents"
      action=""
    >
      {children}
    </form>
  );
}
