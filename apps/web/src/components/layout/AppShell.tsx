'use client';

import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/components/ui/cn';
import type { NavItem } from '@/config/nav/types';
import { SIDEBAR_COOKIE, writePreferenceCookie } from '@/lib/theme';
import { LogoutButton } from './LogoutButton';
import { NAV_ICONS } from './nav-icons';
import { QuickTrack } from './QuickTrack';

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  DISPATCHER: 'Dispatcher',
  MERCHANT: 'Merchant',
  COURIER: 'Courier',
  CUSTOMER: 'Customer',
};

/** The nav item whose href is the longest prefix of the current path. */
function activeHref(nav: NavItem[], pathname: string) {
  let best: string | null = null;
  for (const item of nav) {
    const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

function groupNav(nav: NavItem[]) {
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

function NavLinks({
  nav,
  active,
  collapsed,
  onNavigate,
}: {
  nav: NavItem[];
  active: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groupNav(nav).map((group, gi) => (
        <div key={group.section ?? `g${gi}`}>
          {group.section &&
            (collapsed ? (
              <div className="mx-2 mb-2 border-t border-sidebar-line" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted/80 uppercase">
                {group.section}
              </p>
            ))}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon ? NAV_ICONS[item.icon] : null;
              const isActive = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-sidebar-active text-sidebar-ink'
                        : 'text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-ink',
                    )}
                  >
                    {isActive && (
                      <span
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-logo-orange"
                        aria-hidden="true"
                      />
                    )}
                    {Icon && (
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0',
                          isActive
                            ? 'text-logo-orange'
                            : 'text-sidebar-muted group-hover:text-sidebar-ink',
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarPanel({
  title,
  nav,
  user,
  active,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onClose,
}: {
  title: string;
  nav: NavItem[];
  user: ShellUser;
  active: string | null;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-line',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}
      >
        <Link href="/" className="flex items-center" aria-label="SwiftDrop home">
          {collapsed ? (
            <Logo variant="mark" className="h-7" onDark />
          ) : (
            <Logo className="h-8" onDark />
          )}
        </Link>
        {!collapsed && (
          <span className="ml-auto rounded-md bg-sidebar-2 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sidebar-ink/90 uppercase">
            {title}
          </span>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-ink"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <NavLinks nav={nav} active={active} collapsed={collapsed} onNavigate={onNavigate} />

      <div className="shrink-0 space-y-3 border-t border-sidebar-line p-3">
        {!collapsed && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-sidebar-muted">Theme</span>
            <ThemeToggle tone="sidebar" />
          </div>
        )}
        <div className={cn('flex items-center gap-3 rounded-lg p-2', !collapsed && 'bg-sidebar-2')}>
          {!collapsed && <Avatar name={user.name} size="sm" />}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-ink">{user.name}</p>
              <p className="truncate text-xs text-sidebar-muted">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
            </div>
          )}
          <LogoutButton
            compact
            className={cn(
              'rounded-md p-1.5 text-sidebar-muted transition hover:bg-sidebar hover:text-sidebar-ink',
              collapsed && 'mx-auto',
            )}
          />
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-sidebar-muted transition hover:bg-sidebar-2 hover:text-sidebar-ink',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" /> Collapse
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Portal chrome: left sidebar (collapsible on desktop, drawer on mobile), sticky top bar, and
 * a bottom tab bar on phones for the courier portal. Owner: M1 + M10.
 */
export function AppShell({
  title,
  nav,
  user,
  initialCollapsed,
  children,
}: {
  title: string;
  nav: NavItem[];
  user: ShellUser;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = activeHref(nav, pathname);
  const current = nav.find((n) => n.href === active);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bottomTabs = user.role === 'COURIER';

  function toggleCollapsed() {
    const next = !collapsed;
    writePreferenceCookie(SIDEBAR_COOKIE, next ? 'collapsed' : 'expanded');
    setCollapsed(next);
  }

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-3 py-2 text-brand-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
        aria-label="Sidebar"
      >
        <SidebarPanel
          title={title}
          nav={nav}
          user={user}
          active={active}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 animate-fade-in bg-overlay"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-left shadow-2xl">
            <SidebarPanel
              title={title}
              nav={nav}
              user={user}
              active={active}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div
        className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}
      >
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="-ml-1 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link href="/" className="lg:hidden" aria-label="SwiftDrop home">
              <Logo variant="mark" className="h-7" />
            </Link>
            <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
              <span className="text-muted">{title}</span>
              {current && (
                <>
                  <span className="text-subtle">/</span>
                  <span className="truncate font-medium text-ink">{current.label}</span>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <QuickTrack className="hidden w-56 sm:block xl:w-72" />
              <ThemeToggle className="hidden sm:inline-flex lg:hidden" />
              <div className="flex items-center gap-2 border-l border-line pl-3">
                <Avatar name={user.name} size="sm" />
                <div className="hidden leading-tight xl:block">
                  <p className="text-sm font-medium text-ink">{user.name}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main
          id="main"
          className={cn(
            'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
            bottomTabs && 'pb-24 md:pb-8',
          )}
        >
          {children}
        </main>
      </div>

      {bottomTabs && (
        <nav
          aria-label="Courier"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <ul
            className="grid"
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
          >
            {nav.map((item) => {
              const Icon = item.icon ? NAV_ICONS[item.icon] : null;
              const isActive = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                      isActive ? 'text-brand' : 'text-muted',
                    )}
                  >
                    {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
