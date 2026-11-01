import * as crypto from 'crypto';
import { decryptWebhookSecret, encryptWebhookSecret } from './crypto';

describe('Webhook Secret Crypto (AES-256-GCM)', () => {
  const validKey = crypto.randomBytes(32).toString('base64');
  const shortKey = crypto.randomBytes(16).toString('base64');

  it('performs an encrypt-decrypt round trip successfully', () => {
    const rawSecret = 'whsec_' + crypto.randomBytes(32).toString('hex');
    const encrypted = encryptWebhookSecret(rawSecret, validKey);

    expect(typeof encrypted).toBe('string');
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decryptWebhookSecret(encrypted, validKey);
    expect(decrypted).toBe(rawSecret);
  });

  it('rejects keys that do not decode to 32 bytes', () => {
    expect(() => encryptWebhookSecret('secret', shortKey)).toThrow('32 bytes');
    expect(() => decryptWebhookSecret('a:b:c', shortKey)).toThrow('32 bytes');
  });

  it('fails decryption when ciphertext or auth tag is tampered', () => {
    const rawSecret = 'secret_payload_123';
    const encrypted = encryptWebhookSecret(rawSecret, validKey);
    const [iv, authTag, cipher] = encrypted.split(':');

    // Tamper with the ciphertext: flip one bit of the first byte
    const bytes = Buffer.from(cipher, 'base64');
    bytes[0] ^= 0x01;
    const tampered = `${iv}:${authTag}:${bytes.toString('base64')}`;

    expect(() => decryptWebhookSecret(tampered, validKey)).toThrow();
  });

  it('fails decryption on malformed formatted strings', () => {
    expect(() => decryptWebhookSecret('invalid_string_no_colons', validKey)).toThrow(
      'Invalid encrypted webhook secret format',
    );
  });

  it('writes the base64 format the webhooks worker reads', () => {
    const encrypted = encryptWebhookSecret('whsec_test', validKey);
    const [iv, tag] = encrypted.split(':').map((p) => Buffer.from(p, 'base64'));
    expect(iv).toHaveLength(12);
    expect(tag).toHaveLength(16);
  });
});
