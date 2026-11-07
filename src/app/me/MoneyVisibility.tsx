'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import { IconEye, IconEyeOff } from '@/components/ui/icons';

const MoneyVisibilityContext = createContext<{
  visible: boolean;
  toggle: () => void;
}>({ visible: false, toggle: () => undefined });

export function MoneyVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <MoneyVisibilityContext.Provider value={{ visible, toggle: () => setVisible((value) => !value) }}>
      {children}
    </MoneyVisibilityContext.Provider>
  );
}

export function MoneyVisibilityToggle({
  showLabel,
  hideLabel,
}: {
  showLabel: string;
  hideLabel: string;
}) {
  const { visible, toggle } = useContext(MoneyVisibilityContext);
  const label = visible ? hideLabel : showLabel;
  return (
    <button
      type="button"
      className="btn-ghost btn-sm flex items-center gap-1.5 px-2 text-[12px]"
      aria-label={label}
      aria-pressed={visible}
      onClick={toggle}
    >
      {visible ? <IconEyeOff width={17} height={17} /> : <IconEye width={17} height={17} />}
      <span>{label}</span>
    </button>
  );
}

export function MoneyValue({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { visible } = useContext(MoneyVisibilityContext);
  return (
    <span className={className} dir="ltr" aria-live="polite">
      {visible ? value : '******'}
    </span>
  );
}
