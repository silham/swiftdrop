import { isAllowedRedirectUri, OAuthService } from './oauth.service';

describe('OAuthService (unit)', () => {
  const svc = new OAuthService({} as never, { APP_URL: 'https://swiftdrop.example/' } as never);

  it('derives issuer and MCP resource from APP_URL', () => {
    expect(svc.issuer).toBe('https://swiftdrop.example');
    expect(svc.mcpResource).toBe('https://swiftdrop.example/mcp');
    expect(svc.metadata()).toMatchObject({
      issuer: 'https://swiftdrop.example',
      authorization_endpoint: 'https://swiftdrop.example/oauth/authorize',
      code_challenge_methods_supported: ['S256'],
    });
    expect(svc.resourceMetadata().authorization_servers).toEqual(['https://swiftdrop.example']);
  });

  it.each([
    ['https://claude.ai/api/mcp/auth_callback', true],
    ['https://chatgpt.com/connector_platform_oauth_redirect', true],
    ['http://localhost:6274/oauth/callback', true],
    ['http://127.0.0.1/cb', true],
    ['http://evil.example/cb', false],
    ['https://ok.example/cb#token', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
    [42, false],
  ])('redirect URI %s allowed: %s', (uri, ok) => {
    expect(isAllowedRedirectUri(uri)).toBe(ok);
  });

  it('refuses an empty bearer token without a database call', async () => {
    await expect(svc.authenticateBearer('')).resolves.toBeNull();
  });
});
