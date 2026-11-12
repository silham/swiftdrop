/**
 * OAuth endpoints answer in the RFC 6749 / 7591 error format (`{ error, error_description }`),
 * not the app's `{ error: { code, message } }` envelope, because MCP clients parse it.
 */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }

  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}
