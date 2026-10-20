/**
 * Owner: M2.
 * Transparent session refresh helper. If an API call returns 401,
 * calls POST /api/v1/auth/refresh once and retries the operation.
 */

let refreshPromise: Promise<boolean> | null = null;

export async function silentRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

/**
 * Execute an async API call with automatic 401 retry via silent refresh.
 */
export async function withRefresh<T>(fn: () => Promise<T>): Promise<T> {
  const result = await fn();

  // If result is an openapi-fetch response object { response, error }
  if (
    result &&
    typeof result === 'object' &&
    'response' in result &&
    (result as { response?: Response }).response?.status === 401
  ) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return await fn();
    }
  }

  return result;
}
