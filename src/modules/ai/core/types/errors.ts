export const AI_ERROR_CODES = ["AUTHENTICATION_ERROR","RATE_LIMITED","TIMEOUT","PROVIDER_UNAVAILABLE","MODEL_UNAVAILABLE","INVALID_REQUEST","CONTEXT_LIMIT_EXCEEDED","SAFETY_REFUSAL","MALFORMED_OUTPUT","NETWORK_ERROR","UNKNOWN_PROVIDER_ERROR","NO_COMPATIBLE_MODEL","ALL_CANDIDATES_EXHAUSTED","RATE_LIMIT_EXCEEDED_INTERNAL","RATE_LIMITER_UNAVAILABLE"] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];
export const RETRYABLE_ERROR_CODES: ReadonlySet<AIErrorCode> = new Set(["RATE_LIMITED","TIMEOUT","PROVIDER_UNAVAILABLE","NETWORK_ERROR"]);
export const NON_RETRYABLE_ERROR_CODES: ReadonlySet<AIErrorCode> = new Set(["AUTHENTICATION_ERROR","INVALID_REQUEST","SAFETY_REFUSAL","MODEL_UNAVAILABLE","CONTEXT_LIMIT_EXCEEDED","MALFORMED_OUTPUT","NO_COMPATIBLE_MODEL","ALL_CANDIDATES_EXHAUSTED","RATE_LIMIT_EXCEEDED_INTERNAL","RATE_LIMITER_UNAVAILABLE"]);
export interface AICoreErrorDetails { provider?: string; modelId?: string; providerStatus?: number; fromProvider: boolean; /** Set for internal rate-limit errors: seconds until a retry can succeed. */ retryAfterSeconds?: number; }
export class AICoreError extends Error {
  readonly code: AIErrorCode; readonly details: AICoreErrorDetails; readonly retryable: boolean;
  constructor(code: AIErrorCode, message: string, details: AICoreErrorDetails) {
    super(message); this.name = "AICoreError"; this.code = code; this.details = details; this.retryable = RETRYABLE_ERROR_CODES.has(code);
  }
}
