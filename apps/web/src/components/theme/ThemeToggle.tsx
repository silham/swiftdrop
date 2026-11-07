'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/components/ui/cn';
import { applyTheme, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

const readTheme = (): Theme => (document.documentElement.dataset.theme as Theme) ?? 'system';

/** Re-render when <html data-theme> changes (e.g. another toggle on the page). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * Light / Dark / System switch. Writes the sd_theme cookie (read by the root layout, so there is
 * no flash on reload) and updates <html data-theme> immediately. Owner: M1 + M10.
 */
export function ThemeToggle({
  className,
  tone = 'default',
}: {
  className?: string;
  /** "sidebar" renders on the navy sidebar. */
  tone?: 'default' | 'sidebar';
}) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg p-0.5',
        tone === 'sidebar' ? 'bg-sidebar-2' : 'border border-line bg-surface-2',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => applyTheme(value)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition',
              tone === 'sidebar'
                ? active
                  ? 'bg-sidebar text-sidebar-ink shadow-card'
                  : 'text-sidebar-muted hover:text-sidebar-ink'
                : active
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
