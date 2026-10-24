import { describe, it, expect } from "vitest";
import { validateMessages, textMessage } from "@/modules/ai/core/types/message";
describe("normalized message validation", () => {
  it("rejects empty array", () => { expect(validateMessages([])).toBeTruthy(); });
  it("accepts USER message", () => { expect(validateMessages([textMessage("USER", "hello")])).toBeNull(); });
  it("accepts SYSTEM then USER", () => { expect(validateMessages([textMessage("SYSTEM", "be helpful"), textMessage("USER", "hi")])).toBeNull(); });
  it("rejects SYSTEM after USER", () => { expect(validateMessages([textMessage("USER", "hi"), textMessage("SYSTEM", "be helpful")])).toBeTruthy(); });
  it("rejects TOOL without preceding ASSISTANT", () => { expect(validateMessages([{ role: "TOOL", content: [{ type: "text", text: "r" }], toolCallId: "abc" }])).toBeTruthy(); });
  it("rejects TOOL without toolCallId", () => {
    expect(validateMessages([textMessage("USER", "hi"), textMessage("ASSISTANT", "call"), { role: "TOOL", content: [{ type: "text", text: "r" }] }])).toBeTruthy();
  });
  it("accepts valid TOOL after ASSISTANT", () => {
    expect(validateMessages([textMessage("USER", "hi"), textMessage("ASSISTANT", "call"), { role: "TOOL", content: [{ type: "text", text: "r" }], toolCallId: "abc" }])).toBeNull();
  });
  it("rejects empty content parts", () => { expect(validateMessages([{ role: "USER", content: [] }])).toBeTruthy(); });
});
