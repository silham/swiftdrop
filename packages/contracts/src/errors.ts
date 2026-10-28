/**
 * Stable error codes returned in `{ error: { code, message, details, requestId } }`.
 * Owner: M1. Add new codes freely (append-only, keep alphabetical within a group).
 * See docs/conventions/errors.md.
 */
export const ERROR_CODES = {
  // generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // auth (M2)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  // parcels (M4)
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  PROOF_REQUIRED: 'PROOF_REQUIRED',
  FAILURE_REASON_REQUIRED: 'FAILURE_REASON_REQUIRED',
  MAX_ATTEMPTS_REACHED: 'MAX_ATTEMPTS_REACHED',
  // pricing (M7)
  ZONE_NOT_SERVICED: 'ZONE_NOT_SERVICED',
  // dispatch (M7)
  COURIER_UNAVAILABLE: 'COURIER_UNAVAILABLE',
  ALREADY_ASSIGNED: 'ALREADY_ASSIGNED',
  // merchants (M5)
  MERCHANT_NOT_APPROVED: 'MERCHANT_NOT_APPROVED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  // event pipeline (M8)
  EVENT_BUS_UNAVAILABLE: 'EVENT_BUS_UNAVAILABLE',
  // uploads (M6)
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
