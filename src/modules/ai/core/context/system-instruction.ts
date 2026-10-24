import { renderPreferenceDirective, composeSystemInstruction } from "@/modules/ai/preferences/directive";
import { renderMemoryDirective } from "@/modules/ai/memory/context";
import type { CoreExecutionContext } from "../types/execution-context";
import type { NormalizedMessage } from "../types/message";

export interface ProviderSystemInstruction {
  text: string | undefined;
  memoryRenderedCount: number;
  memoryDroppedCount: number;
  /** Preference field NAMES whose legacy stored value exceeded its limit and was cut (never the text). */
  preferencesTruncatedFields: string[];
}

/**
 * THE single place the provider system instruction is composed (Module 5B.4).
 * Every execution path (today `executeAICoreRequest`; any future streaming
 * path) must call this with the SAME resolved CoreExecutionContext so the
 * authorization and trust policy cannot differ between paths.
 *
 * Order is fixed and is the trust order:
 *   1. caller/platform system text (authoritative)
 *   2. business preferences (untrusted, subordinate)       — 5B.1
 *   3. retrieved business memory (untrusted data, subordinate) — 5B.4
 * Pure: no I/O, no logging of content.
 */
export function buildProviderSystemInstruction(messages: readonly NormalizedMessage[], context: CoreExecutionContext): ProviderSystemInstruction {
  const callerText = messages.find((m) => m.role === "SYSTEM")?.content.find((p) => p.type === "text");
  const preferences = renderPreferenceDirective(context.businessPreferences);
  const withPreferences = composeSystemInstruction(callerText && callerText.type === "text" ? callerText.text : undefined, preferences.text);
  const memory = renderMemoryDirective(context.businessMemory?.items ?? []);
  return { text: composeSystemInstruction(withPreferences, memory.text), memoryRenderedCount: memory.renderedCount, memoryDroppedCount: memory.droppedCount, preferencesTruncatedFields: preferences.truncatedFields };
}
