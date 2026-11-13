import { cookies } from 'next/headers';
import type { NavItem } from '@/config/nav/types';
import type { SessionUser } from '@/lib/auth/session';
import { SIDEBAR_COOKIE } from '@/lib/theme';
import { AppShell } from './AppShell';

/**
 * Shared portal chrome: left sidebar + top bar. Owner: M1. Each portal's layout.tsx passes its own
 * nav; the props are unchanged from the original header shell.
 */
export async function PortalShell({
  title,
  nav,
  user,
  children,
}: {
  title: string;
  nav: NavItem[];
  user: SessionUser;
  children: React.ReactNode;
}) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  return (
    <AppShell
      title={title}
      nav={nav}
      user={{ name: user.name, email: user.email, role: user.role }}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
