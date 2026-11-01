import { createHmac, timingSafeEqual } from 'node:crypto';

/** `X-SwiftDrop-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>` */
export function signPayload(
  secret: string,
  rawBody: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Receiver-side check (documented for merchants, used in our tests). Accepts any of `secrets` so a
 * receiver can verify with the old and the new secret during rotation, and rejects timestamps
 * further than `toleranceSeconds` from now (replay protection).
 */
export function verifySignature(
  secrets: string[],
  rawBody: string,
  header: string,
  { toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) } = {},
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(now - t) > toleranceSeconds) return false;
  const given = Buffer.from(parts.v1, 'hex');
  return secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
