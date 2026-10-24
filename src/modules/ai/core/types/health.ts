export type ProviderHealthStatus = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
export interface ProviderHealthState { provider: string; status: ProviderHealthStatus; consecutiveFailures: number; lastSuccessAt: Date | null; lastFailureAt: Date | null; lastFailureWasRateLimit: boolean; }
export function initialHealthState(provider: string): ProviderHealthState {
  return { provider, status: "UNKNOWN", consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureWasRateLimit: false };
}
