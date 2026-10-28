import { createHmac } from 'node:crypto';
import { signPayload, verifySignature } from './signature';

const body = '{"eventId":"e1"}';

describe('webhook signature', () => {
  it('signs "<t>.<body>" with HMAC-SHA256 in the documented header format', () => {
    const header = signPayload('s3cret', body, 1_700_000_000);
    const expected = createHmac('sha256', 's3cret').update(`1700000000.${body}`).digest('hex');
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });

  it('verifies a valid signature', () => {
    const header = signPayload('s3cret', body, 1_700_000_000);
    expect(verifySignature(['s3cret'], body, header, { now: 1_700_000_100 })).toBe(true);
  });

  it('rejects a wrong secret and a tampered body', () => {
    const header = signPayload('s3cret', body, 1_700_000_000);
    expect(verifySignature(['other'], body, header, { now: 1_700_000_000 })).toBe(false);
    expect(verifySignature(['s3cret'], body + ' ', header, { now: 1_700_000_000 })).toBe(false);
  });

  it('rejects timestamps outside the tolerance (replay protection)', () => {
    const header = signPayload('s3cret', body, 1_700_000_000);
    expect(verifySignature(['s3cret'], body, header, { now: 1_700_000_400 })).toBe(false);
    expect(verifySignature(['s3cret'], body, header, { now: 1_699_999_000 })).toBe(false);
  });

  it('accepts either secret during rotation', () => {
    const header = signPayload('new', body, 1_700_000_000);
    expect(verifySignature(['old', 'new'], body, header, { now: 1_700_000_000 })).toBe(true);
  });

  it('rejects malformed headers', () => {
    for (const header of ['', 'garbage', 't=abc,v1=00', 't=1700000000', 'v1=00']) {
      expect(verifySignature(['s3cret'], body, header, { now: 1_700_000_000 })).toBe(false);
    }
  });
});
