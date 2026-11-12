import { Controller, Delete, Get, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { Public, type AuthUser } from '../../common/auth';
import { AiToolsService } from '../ai-tools';
import { OAuthService } from '../oauth';

const INSTRUCTIONS =
  'SwiftDrop is an island-wide parcel delivery service in Sri Lanka. Use these tools to track ' +
  'parcels, price deliveries and, depending on the signed-in role, manage the user’s own parcels, ' +
  'deliveries or dispatch work. Fees are in LKR. Confirm with the user before any tool that changes data.';

/**
 * MCP endpoint (Streamable HTTP, stateless JSON responses) for Claude, ChatGPT and other MCP
 * clients. Owner: M1. See ADR-0009.
 *
 * Authentication is an OAuth 2.1 bearer token from our own authorization server, not the cookie
 * session, so the route is @Public() for the global JWT guard and checks the token itself. A
 * missing or bad token gets 401 + `WWW-Authenticate: Bearer resource_metadata=…`, which is how a
 * client discovers where to sign in.
 */
@ApiExcludeController()
@Controller('mcp')
@Public()
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly aiTools: AiToolsService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const user = bearer ? await this.oauth.authenticateBearer(bearer) : null;
    if (!user) return this.unauthorized(res, Boolean(bearer));

    const server = this.buildServer(user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: every request carries its own token
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** Stateless server: no standalone SSE stream and no sessions to delete. */
  @Get()
  get(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @Delete()
  remove(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  /** One server per request, holding only the tools this user's role may use. */
  private buildServer(user: AuthUser): McpServer {
    const server = new McpServer(
      { name: 'swiftdrop', title: 'SwiftDrop', version: '1.0.0' },
      { instructions: INSTRUCTIONS },
    );
    for (const tool of this.aiTools.toolsFor(user)) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.input,
          annotations: {
            title: tool.title,
            readOnlyHint: tool.readOnly,
            destructiveHint: !tool.readOnly,
            idempotentHint: tool.readOnly,
            openWorldHint: false,
          },
        },
        async (args: unknown) => {
          const outcome = await this.aiTools.execute(tool.name, args, user);
          // Tool name, role and outcome only: arguments can contain addresses and phone numbers.
          this.logger.log(`mcp tool=${tool.name} role=${user.role} ok=${outcome.ok}`);
          return { content: [{ type: 'text' as const, text: outcome.text }], isError: !outcome.ok };
        },
      );
    }
    return server;
  }

  private unauthorized(res: Response, tokenGiven: boolean) {
    const metadata = `${this.oauth.issuer}/.well-known/oauth-protected-resource/mcp`;
    const challenge = tokenGiven
      ? `Bearer error="invalid_token", error_description="The access token is invalid or expired", resource_metadata="${metadata}"`
      : `Bearer resource_metadata="${metadata}"`;
    res
      .status(401)
      .setHeader('WWW-Authenticate', challenge)
      .json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required' },
        id: null,
      });
  }

  private methodNotAllowed(res: Response) {
    res
      .status(405)
      .setHeader('Allow', 'POST')
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  }
}
