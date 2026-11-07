'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/components/ui/cn';

/** Compact "track a parcel" search for the portal top bar. Owner: M1 + M10. */
export function QuickTrack({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const tn = value.trim().toUpperCase();
        if (tn) {
          router.push(`/track/${encodeURIComponent(tn)}`);
          setValue('');
        }
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
      <input
        aria-label="Quick track by tracking number"
        placeholder="Track a parcel…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:bg-surface focus:ring-4 focus:ring-ring"
      />
    </form>
  );
}
