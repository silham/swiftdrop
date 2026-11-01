import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './secret-crypto';

const key = randomBytes(32).toString('base64');

describe('webhook secret encryption', () => {
  it('round-trips a secret', () => {
    expect(decryptSecret(encryptSecret('whsec_abc123', key), key)).toBe('whsec_abc123');
  });

  it('uses a fresh IV each time and never stores the plaintext', () => {
    const a = encryptSecret('whsec_abc123', key);
    const b = encryptSecret('whsec_abc123', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('whsec_abc123');
    expect(a.split(':')).toHaveLength(3);
  });

  it('fails with the wrong key or tampered data (GCM authentication)', () => {
    const encrypted = encryptSecret('whsec_abc123', key);
    expect(() => decryptSecret(encrypted, randomBytes(32).toString('base64'))).toThrow();
    const [iv, tag, ct] = encrypted.split(':');
    const flipped = Buffer.from(ct!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptSecret([iv, tag, flipped.toString('base64')].join(':'), key)).toThrow();
  });

  it('rejects malformed input and keys that are not 32 bytes', () => {
    expect(() => decryptSecret('nope', key)).toThrow();
    expect(() => encryptSecret('x', Buffer.alloc(16).toString('base64'))).toThrow(/32-byte/);
  });
});
