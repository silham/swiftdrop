import { Alert } from '@/components/ui';
import { ConsentCard, type AuthorizeParams } from '@/features/oauth/ConsentCard';
import { errorMessage } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';

export const metadata = { title: 'Connect an app' };

const KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'resource',
] as const;

/**
 * OAuth authorization endpoint for MCP clients (Claude, ChatGPT…): the consent screen.
 * Owner: M1. proxy.ts sends signed-out visitors to sign in first and back here afterwards.
 * Only the known OAuth parameters are passed on; the API validates them (unknown client or
 * redirect address → error shown here, never a redirect).
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    KEYS.flatMap((k) => (typeof raw[k] === 'string' ? [[k, raw[k]]] : [])),
  ) as AuthorizeParams;

  const api = await serverApi();
  const { data, error } = await api.GET('/api/v1/oauth/authorize/check', {
    params: { query: params },
  });

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      {data ? (
        <ConsentCard check={data} params={params} />
      ) : (
        <div className="space-y-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Can’t connect this app</h1>
          <Alert tone="error">{errorMessage(error, 'This connection request is not valid.')}</Alert>
          <p className="text-sm text-muted">
            Start the connection again from the app you were using.
          </p>
        </div>
      )}
    </div>
  );
}
