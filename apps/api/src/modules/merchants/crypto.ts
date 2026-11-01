import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes standard for GCM

/**
 * Format shared with M8's worker (apps/worker/src/consumers/webhooks/secret-crypto.ts), which
 * decrypts these secrets to sign webhooks: `<iv>:<authTag>:<ciphertext>`, each part **base64**.
 * Changing it means no webhook can be signed. test/merchants checks both sides agree.
 */

/**
 * Encrypts a webhook signing secret with AES-256-GCM.
 * @param secret The raw plaintext secret
 * @param keyBase64 base64-encoded 32-byte encryption key
 * @returns Serialized format: `<iv>:<authTag>:<ciphertext>` (base64 parts)
 */
export function encryptWebhookSecret(secret: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(`WEBHOOK_SECRET_ENC_KEY must decode to 32 bytes (got ${key.length})`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':');
}

/**
 * Decrypts a webhook signing secret encrypted with AES-256-GCM.
 * Exported so both API and M8 webhooks worker consumer can decrypt secrets.
 * @param secretEncrypted Serialized string: `<iv>:<authTag>:<ciphertext>` (base64 parts)
 * @param keyBase64 base64-encoded 32-byte encryption key
 */
export function decryptWebhookSecret(secretEncrypted: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(`WEBHOOK_SECRET_ENC_KEY must decode to 32 bytes (got ${key.length})`);
  }

  const parts = secretEncrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted webhook secret format');
  }

  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
