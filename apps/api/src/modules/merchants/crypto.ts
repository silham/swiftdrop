import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes standard for GCM

/**
 * Encrypts a webhook signing secret with AES-256-GCM.
 * @param secret The raw plaintext secret
 * @param keyBase64 base64-encoded 32-byte encryption key
 * @returns Serialized format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
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

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a webhook signing secret encrypted with AES-256-GCM.
 * Exported so both API and M8 webhooks worker consumer can decrypt secrets.
 * @param secretEncrypted Serialized string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
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

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
