import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { InjectConfig, type Env } from '../../config/config.module';

/** OpenAI chat-completions message shapes (shared by OpenAI, DeepSeek and Gemini's OpenAI endpoint). */
export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlmToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const assistantUnavailable = () =>
  new AppError(
    'ASSISTANT_UNAVAILABLE',
    'The assistant is not available right now. You can still track your parcel on this page.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );

/**
 * Minimal client for any OpenAI-compatible `/chat/completions` endpoint, so the provider is a
 * configuration choice (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) and no vendor SDK is needed.
 * Owner: M1. Message content is never logged.
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  constructor(@InjectConfig() private readonly config: Env) {}

  get enabled(): boolean {
    return Boolean(this.config.LLM_API_KEY && this.config.LLM_MODEL);
  }

  async complete(
    messages: LlmMessage[],
    tools: LlmToolSpec[],
  ): Promise<Extract<LlmMessage, { role: 'assistant' }>> {
    if (!this.enabled) throw assistantUnavailable();
    const url = `${this.config.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.config.LLM_MODEL,
          messages,
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          temperature: 0.2,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(this.config.LLM_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`LLM request failed (${(err as Error).name})`);
      throw assistantUnavailable();
    }
    if (!res.ok) {
      this.logger.warn(`LLM answered HTTP ${res.status}`);
      throw assistantUnavailable();
    }
    const body = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string | null; tool_calls?: LlmToolCall[] } }[];
    } | null;
    const message = body?.choices?.[0]?.message;
    if (!message) {
      this.logger.warn('LLM answer had no message');
      throw assistantUnavailable();
    }
    return {
      role: 'assistant',
      content: message.content ?? null,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    };
  }
}
