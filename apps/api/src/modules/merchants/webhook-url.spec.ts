import { isInternalHostname, isNonPublicIp } from './webhook-url';

describe('webhook URL SSRF guard', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('treats %s as non-public', (ip) => {
    expect(isNonPublicIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111'])(
    'treats %s as public',
    (ip) => {
      expect(isNonPublicIp(ip)).toBe(false);
    },
  );

  it.each([
    'localhost',
    'api.localhost',
    'postgres',
    'minio',
    'metadata.google.internal',
    'printer.local',
    '10.0.0.5',
    '[::1]',
  ])('treats host %s as internal', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  it.each(['example.com', 'hooks.merchant.lk', '8.8.8.8'])('allows public host %s', (host) => {
    expect(isInternalHostname(host)).toBe(false);
  });
});
