import { PortalShell } from '@/components/layout/PortalShell';
import { adminNav } from '@/config/nav/admin';
import { dispatchNav } from '@/config/nav/dispatch';
import { requireRole } from '@/lib/auth/session';

/**
 * Dispatch portal shell. Owner: M7. Server-side role check via the API (requireRole).
 * Admins keep the admin shell and nav here, so dispatch is just another admin section for them
 * (mirrors admin/layout.tsx, which shows the dispatch nav to dispatchers on shared pages).
 */
export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['DISPATCHER', 'ADMIN']);
  return (
    <PortalShell
      title={user.role === 'ADMIN' ? 'Admin' : 'Dispatch'}
      nav={user.role === 'ADMIN' ? adminNav : dispatchNav}
      user={user}
    >
      {children}
    </PortalShell>
  );
}
