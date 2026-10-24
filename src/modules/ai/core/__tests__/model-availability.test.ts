import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  listModels, listUnverifiedModels, listAvailableModels, resolveModelAvailability,
  __setTestModelCatalog, __clearTestModelCatalog,
} from "@/modules/ai/core/models/model.registry";
import { routeRequest } from "@/modules/ai/core/routing/router";
import { AICoreError } from "@/modules/ai/core/types/errors";
import { getProvider } from "@/modules/ai/core/providers/provider.registry";
import type { ModelDefinition } from "@/modules/ai/core/types/model";

function row(overrides: Partial<ModelDefinition>): ModelDefinition {
  return {
    provider: "openai", modelId: "fx", displayName: "fx", capabilities: ["TEXT_GENERATION"],
    contextWindowTokens: 8_000, maxOutputTokens: 1_000, speedTier: "MEDIUM", costTier: "MEDIUM",
    lifecycle: "REGISTERED", metadataVerification: "VERIFIED_AGAINST_DOCS", ...overrides,
  };
}
const TEXT = { requiredCapabilities: ["TEXT_GENERATION" as const], strategy: "BALANCED" as const };

describe("Production routing safety: unverified / deprecated models", () => {
  beforeEach(() => { __clearTestModelCatalog(); });
  afterAll(() => { __clearTestModelCatalog(); });

  it("the provider key is configured in this test env (so the restriction is not an accident of config)", () => {
    expect(getProvider("openai")?.isConfigured()).toBe(true);
  });

  it("an unverified model resolves to UNVERIFIED (not AVAILABLE, not DEPRECATED) even with a configured key", () => {
    const m = row({ modelId: "unverified-openai", metadataVerification: "UNVERIFIED_TRAINING_DATA" });
    expect(resolveModelAvailability(m)).toBe("UNVERIFIED");
  });

  it("listAvailableModels never returns an unverified model", () => {
    __setTestModelCatalog([row({ modelId: "ok" }), row({ modelId: "unverified", metadataVerification: "UNVERIFIED_TRAINING_DATA" })]);
    expect(listAvailableModels().map((m) => m.modelId)).toEqual(["ok"]);
  });

  it("the router never selects an unverified model, even when it is the best strategy match and preferred", () => {
    __setTestModelCatalog([
      row({ modelId: "verified-slow", speedTier: "SLOW", costTier: "HIGH" }),
      row({ modelId: "unverified-fast", speedTier: "FAST", costTier: "LOW", metadataVerification: "UNVERIFIED_TRAINING_DATA" }),
    ]);
    for (const strategy of ["QUALITY", "BALANCED", "FAST", "COST_EFFICIENT"] as const) {
      const r = routeRequest({ ...TEXT, strategy, preferredModelId: "unverified-fast", preferredProvider: "openai" });
      expect(r.selectedModelId).toBe("verified-slow");
      expect(r.rejectedCandidates).toContainEqual({ provider: "openai", modelId: "unverified-fast", reason: "MODEL_METADATA_UNVERIFIED" });
    }
  });

  it("with only unverified models the router fails closed with NO_COMPATIBLE_MODEL", () => {
    __setTestModelCatalog([row({ modelId: "u1", metadataVerification: "UNVERIFIED_TRAINING_DATA" })]);
    try { routeRequest(TEXT); expect.fail("expected throw"); }
    catch (e) { expect((e as AICoreError).code).toBe("NO_COMPATIBLE_MODEL"); }
  });

  it("verified, configured, non-deprecated models remain selectable", () => {
    __setTestModelCatalog([row({ modelId: "good" })]);
    expect(resolveModelAvailability(listModels()[0]!)).toBe("AVAILABLE");
    expect(routeRequest(TEXT).selectedModelId).toBe("good");
  });

  it("deprecated models remain excluded (even when verified) and are not labelled UNVERIFIED", () => {
    const dep = row({ modelId: "dep", lifecycle: "DEPRECATED" });
    __setTestModelCatalog([dep, row({ modelId: "good" })]);
    expect(resolveModelAvailability(dep)).toBe("DEPRECATED");
    const r = routeRequest({ ...TEXT, preferredModelId: "dep" });
    expect(r.selectedModelId).toBe("good");
    expect(r.rejectedCandidates).toContainEqual({ provider: "openai", modelId: "dep", reason: "MODEL_DEPRECATED" });
  });

  it("registry maintenance can still inspect unverified entries", () => {
    __setTestModelCatalog([row({ modelId: "ok" }), row({ modelId: "unv", metadataVerification: "UNVERIFIED_TRAINING_DATA" })]);
    expect(listModels().map((m) => m.modelId)).toEqual(["ok", "unv"]);
    expect(listUnverifiedModels().map((m) => m.modelId)).toEqual(["unv"]);
  });

  it("the REAL registry routes only to verified OpenAI models today", () => {
    const available = listAvailableModels().map((m) => `${m.provider}/${m.modelId}`).sort();
    expect(available).toEqual(["openai/gpt-4o", "openai/gpt-4o-mini"]);
    for (const strategy of ["QUALITY", "BALANCED", "FAST", "COST_EFFICIENT"] as const) {
      expect(routeRequest({ ...TEXT, strategy }).selectedProvider).toBe("openai");
    }
  });
});
