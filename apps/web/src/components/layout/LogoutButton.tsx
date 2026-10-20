'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

/** Owner: M2. Clean sign-out via POST /api/v1/auth/logout. */
export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
    router.refresh();
  }
  return (
    <Button variant="secondary" onClick={logout} className="px-3 py-1.5">
      Sign out
    </Button>
  );
}
