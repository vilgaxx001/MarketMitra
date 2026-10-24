export type MessageRole = "SYSTEM" | "USER" | "ASSISTANT" | "TOOL";
export type MessagePart = { type: "text"; text: string } | { type: "image"; url: string; mimeType?: string };
export interface NormalizedMessage { role: MessageRole; content: MessagePart[]; toolCallId?: string; }
export function textMessage(role: MessageRole, text: string): NormalizedMessage { return { role, content: [{ type: "text", text }] }; }
export function validateMessages(messages: NormalizedMessage[]): string | null {
  if (messages.length === 0) return "At least one message is required.";
  let seenNonSystem = false; let seenAssistant = false;
  for (const msg of messages) {
    if (msg.content.length === 0) return "Every message must have at least one content part.";
    if (msg.role === "SYSTEM" && seenNonSystem) return "SYSTEM messages must come before USER/ASSISTANT/TOOL messages.";
    if (msg.role !== "SYSTEM") seenNonSystem = true;
    if (msg.role === "TOOL") {
      if (!msg.toolCallId) return "TOOL messages must include a toolCallId.";
      if (!seenAssistant) return "A TOOL message must be preceded by an ASSISTANT message.";
    }
    if (msg.role === "ASSISTANT") seenAssistant = true;
  }
  return null;
}
