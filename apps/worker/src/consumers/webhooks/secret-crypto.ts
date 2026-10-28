import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Webhook signing secrets are stored encrypted (AES-256-GCM) in `webhook_endpoints.secretEncrypted`
 * because HMAC signing needs the raw value. Format (agreed with M5):
 *
 *   `<iv>:<authTag>:<ciphertext>`, each part base64; key = base64-decoded WEBHOOK_SECRET_ENC_KEY (32 bytes)
 *
 * The worker only needs `decryptSecret`; `encryptSecret` is the matching writer for M5's
 * create/rotate endpoints and for tests.
 */
const ALGORITHM = 'aes-256-gcm';

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32)
    throw new Error('WEBHOOK_SECRET_ENC_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encryptSecret(secret: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(encrypted: string, base64Key: string): string {
  const [iv, tag, ciphertext] = encrypted.split(':').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !ciphertext) throw new Error('malformed encrypted secret');
  const decipher = createDecipheriv(ALGORITHM, keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
