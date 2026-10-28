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

    // Tamper with the ciphertext
    const tamperedCipher = cipher.slice(0, -2) + (cipher.endsWith('0') ? '1' : '0');
    const tampered = `${iv}:${authTag}:${tamperedCipher}`;

    expect(() => decryptWebhookSecret(tampered, validKey)).toThrow();
  });

  it('fails decryption on malformed formatted strings', () => {
    expect(() => decryptWebhookSecret('invalid_string_no_colons', validKey)).toThrow(
      'Invalid encrypted webhook secret format',
    );
  });
});
