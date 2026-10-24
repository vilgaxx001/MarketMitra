import "server-only";
import { logger } from "@/lib/logger";
import type { AIProviderId } from "./provider";
import type { RoutingStrategy, SelectionReasonCode } from "./routing";
import type { AICoreTerminalStatus } from "./core-response";
export interface ProviderAttempt { provider: AIProviderId; modelId: string; attemptNumber: number; succeeded: boolean; errorCode?: string; latencyMs: number; }
export interface AIExecutionTrace {
  traceId: string; workspaceId: string; businessId: string | null; requestStartedAt: Date; strategy: RoutingStrategy;
  selectionReason: SelectionReasonCode | null; selectedProvider: AIProviderId | null; selectedModelId: string | null;
  attempts: ProviderAttempt[]; retryCount: number; fallbackCount: number; terminalStatus: AICoreTerminalStatus; totalLatencyMs: number;
}
export function logExecutionTrace(trace: AIExecutionTrace): void {
  logger.info({ msg: "ai_execution_trace", traceId: trace.traceId, workspaceId: trace.workspaceId, businessId: trace.businessId,
    strategy: trace.strategy, selectionReason: trace.selectionReason, selectedProvider: trace.selectedProvider,
    selectedModelId: trace.selectedModelId, attemptCount: trace.attempts.length, attempts: trace.attempts,
    retryCount: trace.retryCount, fallbackCount: trace.fallbackCount, terminalStatus: trace.terminalStatus, totalLatencyMs: trace.totalLatencyMs });
}
