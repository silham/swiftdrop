'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Card } from '@/components/ui';

interface DevUser {
  email: string;
  name: string;
  role: string;
}

/**
 * DEV ONLY (NEXT_PUBLIC_ENABLE_DEV_LOGIN=true): one-click sign-in as any seeded account.
 * Lets everyone build their portal before real auth lands. Owner: M1. Remove before the final demo.
 */
export function DevLoginPanel() {
  const router = useRouter();
  const [users, setUsers] = useState<DevUser[]>([]);

  useEffect(() => {
    fetch('/api/v1/dev/users', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  async function loginAs(email: string) {
    const res = await fetch('/api/v1/dev/login-as', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      const { home } = (await res.json()) as { home: string };
      router.push(home);
      router.refresh();
    }
  }

  if (!users.length) return null;
  return (
    <Card className="mt-6 border-dashed border-warning/40" data-testid="dev-login">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-warning uppercase">Dev login</p>
        <span className="text-xs text-muted">One-click demo accounts</span>
      </div>
      <div className="grid gap-1.5">
        {users.map((u) => (
          <button
            key={u.email}
            type="button"
            onClick={() => loginAs(u.email)}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm transition hover:border-line-strong hover:bg-surface-2"
          >
            <Avatar name={u.name} size="xs" />
            <span className="flex-1 font-medium text-ink">{u.name}</span>
            <Badge>{u.role}</Badge>
          </button>
        ))}
      </div>
    </Card>
  );
}
