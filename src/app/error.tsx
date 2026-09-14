'use client';

import { useEffect } from 'react';

import { ErrorState } from '@/components/ui/states';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <ErrorState
          title="حدث خطأ غير متوقع"
          hint="حاول مرة أخرى. إذا تكرر الخطأ، تواصل مع المشرف."
          action={
            <button type="button" className="btn-secondary" onClick={reset}>
              إعادة المحاولة
            </button>
          }
        />
      </div>
    </div>
  );
}
