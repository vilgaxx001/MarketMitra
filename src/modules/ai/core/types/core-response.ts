import type { NormalizedFinishReason } from "./finish-reason";
import type { UsageInfo, AIProviderId } from "./provider";
import type { RoutingStrategy, SelectionReasonCode } from "./routing";
export type AICoreTerminalStatus = "SUCCESS" | "FAILED";
export interface SafeRoutingMetadata { strategy: RoutingStrategy; selectionReason: SelectionReasonCode; candidateCount: number; }
export interface AICoreResponse {
  traceId: string; status: AICoreTerminalStatus; content: string | null; provider: AIProviderId | null; modelId: string | null;
  finishReason: NormalizedFinishReason | null; usage: UsageInfo; providerRequestId?: string; routing: SafeRoutingMetadata | null;
  retryCount: number; fallbackCount: number; totalLatencyMs: number;
}
