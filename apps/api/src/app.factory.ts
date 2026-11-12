/**
 * Shared HTTP app configuration — used by main.ts, the OpenAPI exporter and integration tests,
 * so all three behave identically. Owner: M1.
 */
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AUTH_COOKIES, MERCHANT_API_KEY_HEADER } from '@swiftdrop/contracts';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';
import { requestContextMiddleware } from './common/request-context/request-context';

export const SWAGGER_TAGS = [
  'health',
  'auth',
  'users',
  'bookings',
  'tracking',
  'pricing',
  'dispatch',
  'courier',
  'merchants',
  'merchant-api',
  'admin',
  'reports',
  'audit',
  'event-ops',
  'dev',
  'oauth',
  'mcp',
  'assistant',
] as const;

/**
 * Routes that must live at the site root, not under /api/v1: OAuth discovery documents
 * (RFC 8414 / 9728 fix their paths) and the MCP endpoint that Claude and ChatGPT connect to.
 */
export const ROOT_ROUTES = [
  '.well-known/oauth-authorization-server',
  '.well-known/openid-configuration',
  '.well-known/oauth-protected-resource',
  '.well-known/oauth-protected-resource/mcp',
  'mcp',
];

export function configureApp(app: INestApplication, config: Env) {
  app.use(requestContextMiddleware);
  // Behind the gateway every request would otherwise come from one IP (rate limits per client).
  (app as NestExpressApplication).set?.('trust proxy', config.TRUST_PROXY_HOPS);
  app.setGlobalPrefix('api/v1', {
    exclude: ROOT_ROUTES.map((path) => ({ path, method: RequestMethod.ALL })),
  });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.CORS_ORIGINS.split(','), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('SwiftDrop API')
    .setDescription(
      'REST API for SwiftDrop. Errors: `{ error: { code, message, details, requestId } }`. ' +
        'Browser clients authenticate with the httpOnly `sd_access` cookie; Swagger can use a Bearer token. ' +
        'Partner endpoints under /merchant use the `X-Api-Key` header.',
    )
    .setVersion('1.0')
    .addCookieAuth(AUTH_COOKIES.ACCESS)
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: MERCHANT_API_KEY_HEADER }, 'merchant-api-key');
  for (const tag of SWAGGER_TAGS) builder.addTag(tag);
  return SwaggerModule.createDocument(app, builder.build());
}

export function setupSwagger(app: INestApplication) {
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true },
  });
}
