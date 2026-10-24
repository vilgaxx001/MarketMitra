import { describe, it, expect } from "vitest";
import { listModels } from "@/modules/ai/core/models/model.registry";
describe("deep import chain smoke test", () => {
  it("loads the model registry without throwing", () => { expect(listModels().length).toBeGreaterThan(0); });
});
