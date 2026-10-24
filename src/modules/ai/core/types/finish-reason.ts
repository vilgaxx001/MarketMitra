export type NormalizedFinishReason = "STOP"|"LENGTH"|"TOOL_CALL"|"SAFETY"|"CONTENT_FILTER"|"ERROR"|"UNKNOWN";
export function normalizeOpenAIFinishReason(reason: string | null | undefined): NormalizedFinishReason {
  switch (reason) { case "stop": return "STOP"; case "length": return "LENGTH"; case "tool_calls": case "function_call": return "TOOL_CALL"; case "content_filter": return "CONTENT_FILTER"; default: return "UNKNOWN"; }
}
export function normalizeAnthropicStopReason(reason: string | null | undefined): NormalizedFinishReason {
  switch (reason) { case "end_turn": return "STOP"; case "max_tokens": return "LENGTH"; case "stop_sequence": return "STOP"; case "tool_use": return "TOOL_CALL"; default: return "UNKNOWN"; }
}
export function normalizeGeminiFinishReason(reason: string | null | undefined): NormalizedFinishReason {
  switch (reason) { case "STOP": return "STOP"; case "MAX_TOKENS": return "LENGTH"; case "SAFETY": case "RECITATION": return "SAFETY"; case "OTHER": case "FINISH_REASON_UNSPECIFIED": return "UNKNOWN"; default: return "UNKNOWN"; }
}
