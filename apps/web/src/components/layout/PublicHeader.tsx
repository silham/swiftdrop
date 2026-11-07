'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

const LINKS = [
  { href: '/track', label: 'Track' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#solutions', label: 'Solutions' },
  { href: '/#merchants', label: 'For merchants' },
];

/** Marketing / public header on the navy brand band. Owner: M1 + M10. */
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-sidebar-line bg-sidebar/95 text-sidebar-ink backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="SwiftDrop home" className="shrink-0">
          <Logo className="h-8" onDark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition hover:text-sidebar-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ThemeToggle tone="sidebar" />
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-ink/90 hover:text-sidebar-ink"
          >
            Sign in
          </Link>
          <Link href="/register" className={buttonClasses({ size: 'md' })}>
            Send a parcel
          </Link>
        </div>
        <button
          type="button"
          className="ml-auto rounded-md p-2 text-sidebar-muted hover:text-sidebar-ink md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="public-mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
      <div
        id="public-mobile-menu"
        className={cn('border-t border-sidebar-line px-4 pb-4 md:hidden', !open && 'hidden')}
      >
        <nav aria-label="Mobile" className="flex flex-col py-2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-2.5 text-sm font-medium text-sidebar-ink/90"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className={buttonClasses({ variant: 'secondary', className: 'flex-1' })}
          >
            Sign in
          </Link>
          <Link href="/register" className={buttonClasses({ className: 'flex-1' })}>
            Send a parcel
          </Link>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-sidebar-muted">
          Theme <ThemeToggle tone="sidebar" />
        </div>
      </div>
    </header>
  );
}
