import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authFile } from '../support/auth';

/**
 * AI bonus (M1): the tracking page chatbot and the consent screen an MCP client (Claude, ChatGPT)
 * sends the user to. The real AI apps can't run here, so the test registers a client like they do
 * and stops at their callback.
 */
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

test.describe('MCP connect consent', () => {
  test.use({ storageState: authFile('customer') });

  test('a customer approves an AI app and it receives a one-time code', async ({
    page,
    request,
  }) => {
    const reg = await request.post('/api/v1/oauth/register', {
      data: { client_name: 'Claude', redirect_uris: [CALLBACK] },
    });
    expect(reg.status()).toBe(201);
    const { client_id } = await reg.json();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    // Stand in for the AI app's callback page.
    await page.route(`${CALLBACK}**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Back in the AI app</h1>' }),
    );

    const query = new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: CALLBACK,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'e2e-state',
    });
    await page.goto(`/oauth/authorize?${query}`);
    await expect(
      page.getByRole('heading', { name: 'Allow Claude to use SwiftDrop?' }),
    ).toBeVisible();
    await expect(page.getByText('customer@swiftdrop.test')).toBeVisible();
    await expect(page.getByText('Book a delivery')).toBeVisible();

    await page.getByRole('button', { name: 'Allow' }).click();
    await page.waitForURL(`${CALLBACK}**`);
    const back = new URL(page.url());
    expect(back.searchParams.get('state')).toBe('e2e-state');
    const code = back.searchParams.get('code');
    expect(code).toBeTruthy();

    // What the AI app does next: swap the code (with the PKCE verifier) for a token.
    const token = await request.post('/api/v1/oauth/token', {
      form: { grant_type: 'authorization_code', code: code!, code_verifier: verifier, client_id },
    });
    expect(token.status()).toBe(200);
    expect((await token.json()).token_type).toBe('Bearer');
  });

  test('an unknown app gets an error page, not a redirect', async ({ page }) => {
    await page.goto(
      `/oauth/authorize?response_type=code&client_id=nope&redirect_uri=${encodeURIComponent(
        'https://evil.example/cb',
      )}&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`,
    );
    await expect(page.getByRole('heading', { name: 'Can’t connect this app' })).toBeVisible();
    expect(new URL(page.url()).host).not.toBe('evil.example');
  });
});

test('the tracking page offers the assistant', async ({ page }) => {
  await page.goto('/track/SD100000002');
  await page.getByRole('button', { name: 'Ask SwiftDrop' }).click();
  const dialog = page.getByRole('dialog', { name: 'SwiftDrop assistant' });
  await expect(dialog).toBeVisible();
  // Without an LLM key (CI, fresh clones) it explains itself instead of failing.
  const enabled = (await (await page.request.get('/api/v1/assistant')).json()).enabled;
  if (enabled) {
    await expect(dialog.getByRole('button', { name: 'Where is SD100000002?' })).toBeVisible();
  } else {
    await expect(dialog.getByText('not switched on')).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Close assistant' }).click();
  await expect(dialog).toBeHidden();
});
