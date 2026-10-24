import "server-only";
import type { AIErrorCode } from "../types/errors";
import { initialHealthState, type ProviderHealthState } from "../types/health";
const DEGRADED_THRESHOLD = 2;
const UNAVAILABLE_THRESHOLD = 5;
const HEALTH_AFFECTING_CODES: ReadonlySet<AIErrorCode> = new Set(["RATE_LIMITED","TIMEOUT","PROVIDER_UNAVAILABLE","NETWORK_ERROR","AUTHENTICATION_ERROR","UNKNOWN_PROVIDER_ERROR"]);
export function isHealthAffectingError(code: AIErrorCode): boolean { return HEALTH_AFFECTING_CODES.has(code); }
const state = new Map<string, ProviderHealthState>();
function getOrInit(provider: string): ProviderHealthState {
  let s = state.get(provider);
  if (!s) { s = initialHealthState(provider); state.set(provider, s); }
  return s;
}
export function getProviderHealth(provider: string): ProviderHealthState { return { ...getOrInit(provider) }; }
export function recordSuccess(provider: string): void {
  const s = getOrInit(provider);
  s.status = "HEALTHY"; s.consecutiveFailures = 0; s.lastSuccessAt = new Date(); s.lastFailureWasRateLimit = false;
}
export function recordFailure(provider: string, code: AIErrorCode): void {
  if (!isHealthAffectingError(code)) return;
  const s = getOrInit(provider);
  s.consecutiveFailures += 1; s.lastFailureAt = new Date(); s.lastFailureWasRateLimit = code === "RATE_LIMITED";
  if (s.consecutiveFailures >= UNAVAILABLE_THRESHOLD) s.status = "UNAVAILABLE";
  else if (s.consecutiveFailures >= DEGRADED_THRESHOLD) s.status = "DEGRADED";
}
export function __resetHealthStateForTests(): void { state.clear(); }
