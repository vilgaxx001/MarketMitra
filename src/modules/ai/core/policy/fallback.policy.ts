import type { AIErrorCode } from "../types/errors";
export const MAX_PROVIDER_ATTEMPTS = 3;
const FALLBACK_BLOCKED_CODES: ReadonlySet<AIErrorCode> = new Set(["SAFETY_REFUSAL","INVALID_REQUEST","NO_COMPATIBLE_MODEL","ALL_CANDIDATES_EXHAUSTED","RATE_LIMIT_EXCEEDED_INTERNAL"]);
export function isFallbackAllowed(code: AIErrorCode): boolean { return !FALLBACK_BLOCKED_CODES.has(code); }
export function buildAttemptKey(provider: string, modelId: string): string { return `${provider}:${modelId}`; }
export function hasReachedMaxAttempts(attemptedCombos: ReadonlySet<string>): boolean { return attemptedCombos.size >= MAX_PROVIDER_ATTEMPTS; }
