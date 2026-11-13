'use client';
/**
 * Typed API client for CLIENT components. Types come from the API's OpenAPI spec
 * (`pnpm gen:api` → src/lib/api/schema.d.ts, gitignored, regenerated on dev/build).
 *
 *   const { data, error } = await api.POST('/api/v1/pricing/estimate', { body: { ... } });
 *
 * Requests go to the same origin (gateway) so the httpOnly session cookie is sent automatically.
 * When the short-lived access cookie has expired, a 401 triggers one silent refresh and the
 * request is replayed, so people are not logged out mid-task. Owner: M1 (refresh wiring: M2).
 */
import createClient from 'openapi-fetch';
import { silentRefresh } from '@/features/auth/silent-refresh';
import type { paths } from './schema';

const AUTH_PATH = '/api/v1/auth/';

async function fetchWithRefresh(request: Request): Promise<Response> {
  // A request body can only be read once, so keep a copy for the replay.
  const replay = request.clone();
  const response = await fetch(request);

  if (response.status !== 401 || new URL(request.url).pathname.startsWith(AUTH_PATH)) {
    return response;
  }
  if (await silentRefresh()) return fetch(replay);

  // The refresh token is gone too: the session is really over.
  if (typeof window !== 'undefined') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // A full page load on purpose: it also drops any state held by the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${next}`);
  }
  return response;
}

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'include',
  fetch: fetchWithRefresh,
});
