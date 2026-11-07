'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, cn, Input } from '@/components/ui';

/** Owner: M4. Tracking-number search → /track/<number>. */
export function TrackForm({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const lg = size === 'lg';
  return (
    <form
      role="search"
      className={cn('flex gap-2', lg && 'flex-col sm:flex-row', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const tn = value.trim().toUpperCase();
        if (tn) router.push(`/track/${encodeURIComponent(tn)}`);
      }}
    >
      <div className="relative flex-1">
        <Search
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-subtle',
            lg ? 'left-4 h-5 w-5' : 'left-3 h-4 w-4',
          )}
          aria-hidden="true"
        />
        <Input
          aria-label="Tracking number"
          placeholder="Tracking number, e.g. SD100000002"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={cn('font-mono tracking-wide', lg ? 'h-12 pl-12 text-base' : 'pl-9')}
        />
      </div>
      <Button type="submit" size={lg ? 'lg' : 'md'} className={cn(lg && 'h-12 px-8')}>
        Track
      </Button>
    </form>
  );
}
