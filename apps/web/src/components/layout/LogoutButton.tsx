'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

/** Owner: M2. Clean sign-out via POST /api/v1/auth/logout. */
export function LogoutButton({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon-only button (collapsed sidebar). */
  compact?: boolean;
}) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
    router.refresh();
  }
  if (compact || className) {
    return (
      <button
        type="button"
        onClick={logout}
        className={className}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {!compact && <span>Sign out</span>}
      </button>
    );
  }
  return (
    <Button variant="secondary" onClick={logout} className="px-3 py-1.5">
      Sign out
    </Button>
  );
}
