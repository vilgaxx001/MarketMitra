import type { NormalizedFinishReason } from "./finish-reason";
import type { UsageInfo } from "./provider";
export interface StreamStartedEvent { type: "STREAM_STARTED"; provider: string; modelId: string; }
export interface ContentDeltaEvent { type: "CONTENT_DELTA"; delta: string; }
export interface ToolCallDeltaEvent { type: "TOOL_CALL_DELTA"; toolCallId: string; toolName?: string; argumentsDelta: string; }
export interface UsageEvent { type: "USAGE"; usage: UsageInfo; }
export interface StreamCompletedEvent { type: "STREAM_COMPLETED"; finishReason: NormalizedFinishReason; rawFinishReason: string | null; totalLatencyMs: number; }
export interface StreamErrorEvent { type: "STREAM_ERROR"; code: string; message: string; }
export type StreamEvent = StreamStartedEvent | ContentDeltaEvent | ToolCallDeltaEvent | UsageEvent | StreamCompletedEvent | StreamErrorEvent;
