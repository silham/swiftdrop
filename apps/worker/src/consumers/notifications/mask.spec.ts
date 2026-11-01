import { maskEmail, maskPhone } from './mask';

describe('recipient masking', () => {
  it('keeps the first and last character of the local part and the domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j******e@example.com');
    expect(maskEmail('jo@example.com')).toBe('j*@example.com');
    expect(maskEmail('a@example.com')).toBe('a*@example.com');
  });

  it('tells apart addresses on the same domain', () => {
    expect(maskEmail('john@gmail.com')).not.toBe(maskEmail('jane@gmail.com'));
  });

  it('never leaks the middle of an address', () => {
    expect(maskEmail('secretname@example.com')).not.toContain('ecretnam');
  });

  it('masks phone numbers down to the last 3 digits', () => {
    expect(maskPhone('+94 77 123 4567')).toBe('********567');
    expect(maskPhone('0771234567')).toBe('*******567');
    expect(maskPhone('12')).toBe('***');
  });

  it('handles garbage input without throwing', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('')).toBe('***');
    expect(maskPhone('')).toBe('***');
  });
});
