import type { Role } from '@swiftdrop/contracts';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth';

/**
 * One capability an AI client may call. Owner: M1.
 *
 * Tools are thin adapters over the existing services, so the same business rules, ownership checks
 * ("is this parcel MINE?") and audit entries apply as when the user clicks through the web app.
 * The zod schema describes the input for the model; write tools additionally validate against the
 * service's own class-validator DTO (see `validateDto`).
 */
export interface AiTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  /** `'public'` tools need no account (also offered by the tracking page chatbot). */
  roles: 'public' | readonly Role[];
  readOnly: boolean;
  input: S;
  run(input: z.infer<S>, user: AuthUser | null): Promise<unknown>;
}

/** What a tool call returns to the model: always text, never a stack trace. */
export interface ToolOutcome {
  ok: boolean;
  text: string;
  data?: unknown;
}

/** Keeps the generic parameter when building the registry array. */
export function defineTool<S extends z.ZodObject>(tool: AiTool<S>): AiTool {
  return tool as unknown as AiTool;
}
