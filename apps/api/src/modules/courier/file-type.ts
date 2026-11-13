/**
 * Proof-of-delivery upload checks. We trust the file's first bytes, never the client's mimetype
 * or file name. Owner: M6.
 */
export interface ImageType {
  ext: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Returns the image type for JPEG, PNG or WebP bytes, or null for anything else. */
export function detectImageType(buf: Buffer | Uint8Array | undefined | null): ImageType | null {
  if (!buf || buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (PNG_SIGNATURE.every((byte, i) => buf[i] === byte)) {
    return { ext: 'png', mime: 'image/png' };
  }
  // RIFF....WEBP
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

/** Content type for a stored object key, from the extension we chose at upload time. */
export function mimeForKey(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.jpg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Multer keeps uploads in memory, so it gets a hard ceiling to protect the process. The real
 * limit is UPLOAD_MAX_BYTES, checked in CourierService so the error is FILE_TOO_LARGE.
 */
export const MULTER_HARD_LIMIT_BYTES = 10 * 1024 * 1024;
