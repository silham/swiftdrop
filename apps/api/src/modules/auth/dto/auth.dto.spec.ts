import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './auth.dto';

const valid = { email: 'jane@example.com', password: 'Password123!', name: 'Jane Doe' };

async function problems<T extends object>(cls: new () => T, input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, input));
  return errors.map((e) => e.property).sort();
}

describe('RegisterDto password policy', () => {
  it('accepts passwords from 8 up to 128 characters', async () => {
    expect(await problems(RegisterDto, { ...valid, password: 'a'.repeat(8) })).toEqual([]);
    expect(await problems(RegisterDto, { ...valid, password: 'a'.repeat(128) })).toEqual([]);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    expect(await problems(RegisterDto, { ...valid, password: 'a'.repeat(7) })).toEqual([
      'password',
    ]);
    expect(await problems(RegisterDto, { ...valid, password: '' })).toEqual(['password']);
  });

  it('rejects passwords longer than 128 characters (protects the hashing step)', async () => {
    expect(await problems(RegisterDto, { ...valid, password: 'a'.repeat(129) })).toEqual([
      'password',
    ]);
  });

  it('rejects a missing or non-text password', async () => {
    expect(await problems(RegisterDto, { email: valid.email, name: valid.name })).toEqual([
      'password',
    ]);
    expect(await problems(RegisterDto, { ...valid, password: 12345678 })).toEqual(['password']);
    expect(await problems(RegisterDto, { ...valid, password: ['Password123!'] })).toEqual([
      'password',
    ]);
  });

  it('counts characters, so a short password of multi-byte characters is still too short', async () => {
    expect(await problems(RegisterDto, { ...valid, password: 'äöüäöüä' })).toEqual(['password']);
    expect(await problems(RegisterDto, { ...valid, password: 'äöüäöüäö' })).toEqual([]);
  });
});

describe('RegisterDto other fields', () => {
  it('requires a valid email and a name of 2–100 characters', async () => {
    expect(await problems(RegisterDto, { ...valid, email: 'not-an-email' })).toEqual(['email']);
    expect(await problems(RegisterDto, { ...valid, name: 'J' })).toEqual(['name']);
    expect(await problems(RegisterDto, { ...valid, name: 'J'.repeat(101) })).toEqual(['name']);
  });

  it('accepts an optional phone in international or local digits and rejects junk', async () => {
    expect(await problems(RegisterDto, { ...valid, phone: '+94771234567' })).toEqual([]);
    expect(await problems(RegisterDto, { ...valid, phone: '0771234567' })).toEqual([]);
    expect(await problems(RegisterDto, { ...valid, phone: '077-123' })).toEqual(['phone']);
    expect(await problems(RegisterDto, { ...valid, phone: 'call me' })).toEqual(['phone']);
  });
});

describe('LoginDto', () => {
  it('does not apply the registration length rule (old passwords must still be able to log in)', async () => {
    expect(await problems(LoginDto, { email: valid.email, password: 'short' })).toEqual([]);
  });

  it('caps the password length', async () => {
    expect(await problems(LoginDto, { email: valid.email, password: 'a'.repeat(129) })).toEqual([
      'password',
    ]);
  });
});
