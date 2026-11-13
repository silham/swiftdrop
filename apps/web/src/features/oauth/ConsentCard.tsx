'use client';

import { Bot, Eye, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

type Check = components['schemas']['AuthorizeCheckDto'];
export type AuthorizeParams = Omit<components['schemas']['AuthorizeDecisionDto'], 'decision'>;

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'customer',
  MERCHANT: 'merchant',
  COURIER: 'courier',
  DISPATCHER: 'dispatcher',
  ADMIN: 'admin',
};

/**
 * "Allow <AI app> to use your SwiftDrop account?" Owner: M1.
 * The API validates the request again on submit and returns where to send the browser: back to the
 * AI app with a one-time code, or with `error=access_denied`.
 */
export function ConsentCard({ check, params }: { check: Check; params: AuthorizeParams }) {
  const [pending, setPending] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string>();
  const readTools = check.tools.filter((t) => t.readOnly);
  const writeTools = check.tools.filter((t) => !t.readOnly);

  async function decide(decision: 'allow' | 'deny') {
    setPending(decision);
    setError(undefined);
    const { data, error: apiError } = await api.POST('/api/v1/oauth/authorize', {
      body: { ...params, decision },
    });
    if (apiError || !data) {
      setPending(null);
      setError(errorMessage(apiError, 'Could not complete the request'));
      return;
    }
    // The AI app's callback is on another site, so this is a full navigation.
    window.location.assign(data.redirectTo);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Allow {check.clientName} to use SwiftDrop?
          </h1>
          <p className="mt-1 text-sm text-muted">
            It will act as <span className="font-medium text-ink">{check.user.email}</span> (
            {ROLE_LABEL[check.user.role] ?? check.user.role}) and return to{' '}
            <span className="font-medium text-ink">{check.redirectHost}</span>.
          </p>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <ToolList icon={Eye} title="It will be able to see" tools={readTools} />
      {writeTools.length > 0 && (
        <ToolList icon={PencilLine} title="It will be able to change" tools={writeTools} />
      )}

      <p className="text-xs text-muted">
        Everything it does is checked like your own clicks and recorded under your name. Access
        lasts until you sign out of the app there, or for 30 days without use.
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => decide('deny')}
          disabled={pending !== null}
        >
          {pending === 'deny' ? 'Cancelling…' : 'Deny'}
        </Button>
        <Button type="button" onClick={() => decide('allow')} disabled={pending !== null}>
          {pending === 'allow' ? 'Connecting…' : 'Allow'}
        </Button>
      </div>
    </div>
  );
}

function ToolList({
  icon: Icon,
  title,
  tools,
}: {
  icon: typeof Eye;
  title: string;
  tools: Check['tools'];
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
        {title}
      </h2>
      <ul className="grid gap-1.5 text-sm text-muted sm:grid-cols-2">
        {tools.map((t) => (
          <li key={t.name} className="rounded-lg bg-surface-2 px-3 py-1.5">
            {t.title}
          </li>
        ))}
      </ul>
    </section>
  );
}
