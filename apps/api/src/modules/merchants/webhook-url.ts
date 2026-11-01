import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for merchant webhook URLs (owner: M5). The worker POSTs to these URLs from inside our
 * network and merchants can read the response status, so an internal target (database, object
 * storage, cloud metadata, …) must never be accepted.
 */

/** True for loopback, private, link-local, CGNAT, unspecified and similar non-public IPs. */
export function isNonPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast + reserved
    );
  }
  if (version === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped) return isNonPublicIp(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6); // ULA, link-local, multicast
  }
  return false;
}

/**
 * True when the host is obviously internal without DNS: an internal IP literal, `localhost`,
 * a single-label name (docker service names like `postgres`, `minio`, `api`) or `.internal`/`.local`.
 */
export function isInternalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) return isNonPublicIp(host);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    !host.includes('.')
  );
}

/** Resolves the host and returns true if any address is non-public (or it does not resolve). */
export async function resolvesToNonPublicIp(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some((a) => isNonPublicIp(a.address));
  } catch {
    return true;
  }
}
