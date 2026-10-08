'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application Error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground text-center space-y-4">
          <h1 className="text-3xl font-bold">Something went wrong!</h1>
          <p className="text-xs text-muted-foreground max-w-md">
            {error.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-2">
            <button onClick={() => reset()} className="btn-secondary text-xs font-bold px-4 py-2">
              Try Again
            </button>
            <Link href="/sales" className="btn-primary text-xs font-bold px-4 py-2">
              Open Sales & POS
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
