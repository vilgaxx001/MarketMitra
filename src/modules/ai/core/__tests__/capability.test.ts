import { describe, it, expect } from "vitest";
import { hasCapability, hasAllCapabilities, missingCapabilities } from "@/modules/ai/core/types/capability";
describe("capability system", () => {
  it("hasCapability checks membership", () => {
    expect(hasCapability(["TEXT_GENERATION", "STREAMING"], "STREAMING")).toBe(true);
    expect(hasCapability(["TEXT_GENERATION"], "VISION")).toBe(false);
  });
  it("hasAllCapabilities requires every listed capability", () => {
    expect(hasAllCapabilities(["TEXT_GENERATION", "STREAMING", "VISION"], ["TEXT_GENERATION", "VISION"])).toBe(true);
    expect(hasAllCapabilities(["TEXT_GENERATION"], ["TEXT_GENERATION", "VISION"])).toBe(false);
  });
  it("empty required list is trivially satisfied", () => {
    expect(hasAllCapabilities([], [])).toBe(true);
    expect(hasAllCapabilities(["TEXT_GENERATION"], [])).toBe(true);
  });
  it("missingCapabilities returns exactly what's absent", () => {
    expect(missingCapabilities(["TEXT_GENERATION"], ["TEXT_GENERATION", "VISION", "TOOL_CALLING"])).toEqual(["VISION", "TOOL_CALLING"]);
    expect(missingCapabilities(["TEXT_GENERATION", "VISION", "TOOL_CALLING"], ["TEXT_GENERATION"])).toEqual([]);
  });
});
