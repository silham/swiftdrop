import { detectImageType, mimeForKey } from './file-type';

const pad = (bytes: number[]) => Buffer.from([...bytes, ...new Array(16).fill(0)]);

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      ext: 'jpg',
      mime: 'image/jpeg',
    });
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      ext: 'png',
      mime: 'image/png',
    });
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
    ]);
    expect(detectImageType(webp)).toEqual({ ext: 'webp', mime: 'image/webp' });
  });

  it('rejects a text file renamed to .jpg', () => {
    expect(detectImageType(Buffer.from('this is definitely not a photo'))).toBeNull();
  });

  it('rejects other formats and too-short or missing buffers', () => {
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7.....'))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('mimeForKey', () => {
  it('maps stored keys back to a content type', () => {
    expect(mimeForKey('pod/p1/a.png')).toBe('image/png');
    expect(mimeForKey('pod/p1/a.jpg')).toBe('image/jpeg');
    expect(mimeForKey('pod/p1/a.webp')).toBe('image/webp');
    expect(mimeForKey('pod/p1/a')).toBe('application/octet-stream');
  });
});
