'use client';

import { Check, Copy, KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Owner: M5. One-time reveal for a raw API key or webhook signing secret. The value is only held in
 * component state and is never logged.
 */
export function SecretReveal({
  title,
  children,
  value,
  copyLabel,
  onDismiss,
}: {
  title: string;
  children: React.ReactNode;
  value: string;
  copyLabel: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <section
      className="rounded-xl border border-brand/40 bg-brand-soft/60 p-5 shadow-card ring-4 ring-ring/40"
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-sm text-muted">{children}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          readOnly
          aria-label={title}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none select-all focus:border-brand focus:ring-4 focus:ring-ring"
        />
        <Button variant="primary" onClick={() => void copy()} className="shrink-0">
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" /> {copyLabel}
            </>
          )}
        </Button>
      </div>
      {copyError && (
        <p className="mt-2 text-xs text-danger" role="alert">
          Could not copy automatically. Select the value and copy it manually.
        </p>
      )}
    </section>
  );
}
