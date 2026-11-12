/**
 * Environment schema — validated at startup; the app refuses to boot on invalid config.
 * Owner: M1. Adding a variable: add it here AND to /.env.example in the same PR.
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Public base URL the browser uses (the Caddy gateway). */
  APP_URL: z.url().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().default('http://localhost:8080,http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(7),
  JWT_ISSUER: z.string().default('swiftdrop-api'),
  JWT_AUDIENCE: z.string().default('swiftdrop-web'),
  COOKIE_SECURE: bool,

  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:8080/api/v1/auth/google/callback'),

  S3_ENDPOINT: z.string().default('minio'),
  S3_PORT: z.coerce.number().default(9000),
  S3_USE_SSL: bool,
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_POD: z.string().default('proof-of-delivery'),
  UPLOAD_MAX_BYTES: z.coerce.number().default(5 * 1024 * 1024),

  /** base64-encoded 32-byte key used to encrypt webhook signing secrets at rest (M5/M8). */
  WEBHOOK_SECRET_ENC_KEY: z.string().min(40),

  /** DEV ONLY: enables POST /api/v1/dev/login-as. Always false in production. */
  ENABLE_DEV_LOGIN: bool,
  THROTTLE_TTL_MS: z.coerce.number().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().default(300),
  /** Reverse proxies in front of the API (Caddy = 1). Lets rate limits see the real client IP. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

  /**
   * Tracking page chatbot: any OpenAI-compatible chat-completions API (OpenAI, DeepSeek, Gemini).
   * Without LLM_API_KEY the assistant is switched off and answers 503.
   */
  LLM_BASE_URL: z.url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.ENABLE_DEV_LOGIN) {
    throw new Error('ENABLE_DEV_LOGIN must be false in production');
  }
  if (parsed.data.LLM_API_KEY && !parsed.data.LLM_MODEL) {
    throw new Error('LLM_MODEL is required when LLM_API_KEY is set');
  }
  return parsed.data;
}
