import { RETRYABLE_ERROR_CODES } from "../types/errors";
import type { AIErrorCode } from "../types/errors";
export const MAX_RETRIES_PER_MODEL = 2;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 4_000;
export function isRetryableError(code: AIErrorCode): boolean { return RETRYABLE_ERROR_CODES.has(code); }
export function isRetryBlockedByOversizedRequest(code: AIErrorCode): boolean { return code === "CONTEXT_LIMIT_EXCEEDED"; }
export function computeBackoffMs(attempt: number, randomFn: () => number = Math.random): number {
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.floor(randomFn() * cap);
}
export function shouldRetry(code: AIErrorCode, attemptsSoFar: number): boolean {
  if (attemptsSoFar >= MAX_RETRIES_PER_MODEL) return false;
  if (isRetryBlockedByOversizedRequest(code)) return false;
  return isRetryableError(code);
}
