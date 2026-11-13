import type { Request, Response } from 'express';
import { AuthController, safeNextPath } from './auth.controller';

/** The Google redirect carries an optional same-site `next` through a short-lived cookie. */
describe('AuthController Google next (unit)', () => {
  const session = {
    user: { id: 'u1', email: 'a@b.test', name: 'A', role: 'CUSTOMER' },
    home: '/customer',
    accessToken: 'at',
    refreshToken: 'rt',
  };
  const auth = {
    googleAuthUrl: jest.fn().mockResolvedValue({
      url: 'https://accounts.google.test/auth',
      state: 'st',
      codeVerifier: 'cv',
    }),
    googleCallback: jest.fn().mockResolvedValue(session),
  };
  const tokens = {
    cookieOptions: () => ({ secure: false }),
    setAccessCookie: jest.fn(),
    setRefreshCookie: jest.fn(),
  };
  const controller = new AuthController(auth as never, tokens as never);

  function fakeRes() {
    return {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response & { cookie: jest.Mock; redirect: jest.Mock; clearCookie: jest.Mock };
  }

  it('stores a safe next path and returns there after the callback', async () => {
    const res = fakeRes();
    await controller.google('/oauth/authorize?client_id=x&state=y', res);
    expect(res.cookie).toHaveBeenCalledWith(
      'sd_oauth_next',
      '/oauth/authorize?client_id=x&state=y',
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth/google' }),
    );

    const back = fakeRes();
    const req = {
      cookies: {
        sd_oauth_state: 'st',
        sd_oauth_verifier: 'cv',
        sd_oauth_next: '/oauth/authorize?client_id=x&state=y',
      },
      headers: {},
    } as unknown as Request;
    await controller.googleCallback('code', 'st', req, back);
    expect(back.clearCookie).toHaveBeenCalledWith('sd_oauth_next', { path: '/api/v1/auth/google' });
    expect(back.redirect).toHaveBeenCalledWith('/oauth/authorize?client_id=x&state=y');
  });

  it.each(['https://evil.example', '//evil.example', '/api/v1/auth/logout'])(
    'ignores an unsafe next (%s)',
    async (next) => {
      const res = fakeRes();
      await controller.google(next, res);
      expect(res.cookie).not.toHaveBeenCalledWith(
        'sd_oauth_next',
        expect.anything(),
        expect.anything(),
      );
    },
  );

  it('goes to the role home when there is no next cookie, or a tampered one', async () => {
    for (const cookie of [undefined, 'https://evil.example']) {
      const res = fakeRes();
      const req = {
        cookies: { sd_oauth_state: 'st', sd_oauth_verifier: 'cv', sd_oauth_next: cookie },
        headers: {},
      } as unknown as Request;
      await controller.googleCallback('code', 'st', req, res);
      expect(res.redirect).toHaveBeenCalledWith('/customer');
    }
  });

  it('safeNextPath keeps query strings, including a long OAuth consent URL', () => {
    expect(safeNextPath('/oauth/authorize?a=1&b=2')).toBe('/oauth/authorize?a=1&b=2');
    const consent = `/oauth/authorize?client_id=${'c'.repeat(60)}&state=${'s'.repeat(600)}`;
    expect(safeNextPath(consent)).toBe(consent);
    expect(safeNextPath(`/${'x'.repeat(2048)}`)).toBeNull();
  });
});
