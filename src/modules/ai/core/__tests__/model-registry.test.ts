import { describe, it, expect, beforeAll } from "vitest";
import { listModels, getModel, resolveModelAvailability, __clearTestModelCatalog } from "@/modules/ai/core/models/model.registry";
import type { ModelDefinition } from "@/modules/ai/core/types/model";
import type { AICapability } from "@/modules/ai/core/types/capability";

/**
 * The maximum capability set each provider's CURRENT adapter
 * implementation genuinely supports (see each adapter file / the
 * registry's own capability-truthfulness comments). A model may declare
 * a SUBSET of its provider's ceiling, never anything beyond it — that
 * would be exactly the false-capability-declaration bug this file
 * guards against.
 */
const ADAPTER_CAPABILITY_CEILING: Record<ModelDefinition["provider"], AICapability[]> = {
  openai: ["TEXT_GENERATION", "STREAMING", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT"],
  anthropic: ["TEXT_GENERATION", "STREAMING", "VISION", "LONG_CONTEXT"], // no STRUCTURED_OUTPUT — adapter sends no such request hint
  gemini: ["TEXT_GENERATION", "STREAMING", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT"],
  grok: [], // not registered at all in 5A
  deepseek: [], // not registered at all in 5A
};

describe("Model Registry invariants", () => {
  // Inspect the REAL registry, not the synthetic fixture catalog installed globally.
  beforeAll(() => { __clearTestModelCatalog(); });

  it("every model has a provider", () => {
    for (const m of listModels()) expect(m.provider).toBeTruthy();
  });

  it("every model declares at least TEXT_GENERATION", () => {
    for (const m of listModels()) expect(m.capabilities).toContain("TEXT_GENERATION");
  });

  it("no model claims TOOL_CALLING — not implemented by any adapter in Module 5A", () => {
    for (const m of listModels()) expect(m.capabilities).not.toContain("TOOL_CALLING");
  });

  it("no model claims EMBEDDINGS — every registered model is a chat/completion model, not an embedding model", () => {
    for (const m of listModels()) expect(m.capabilities).not.toContain("EMBEDDINGS");
  });

  it("every model's capabilities are a subset of its provider's adapter capability ceiling", () => {
    for (const m of listModels()) {
      const ceiling = ADAPTER_CAPABILITY_CEILING[m.provider];
      for (const cap of m.capabilities) {
        expect(ceiling, `${m.provider}/${m.modelId} claims ${cap}, which its adapter does not implement`).toContain(cap);
      }
    }
  });

  it("registry contains no duplicate provider/model combinations", () => {
    const seen = new Set<string>();
    for (const m of listModels()) {
      const key = `${m.provider}:${m.modelId}`;
      expect(seen.has(key), `duplicate registry entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every model has an explicit metadataVerification state", () => {
    for (const m of listModels()) {
      expect(["UNVERIFIED_TRAINING_DATA", "VERIFIED_AGAINST_DOCS"]).toContain(m.metadataVerification);
    }
  });

  it("verification state is consistent: VERIFIED rows carry evidence; only OpenAI gpt-4o/gpt-4o-mini are verified", () => {
    const verifiedIds = listModels().filter((m) => m.metadataVerification === "VERIFIED_AGAINST_DOCS").map((m) => m.modelId).sort();
    expect(verifiedIds).toEqual(["gpt-4o", "gpt-4o-mini"]);
    for (const m of listModels().filter((x) => x.metadataVerification === "VERIFIED_AGAINST_DOCS")) {
      expect(m.verification?.sources.length).toBeGreaterThan(0);
      expect(m.verification?.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.lifecycle).toBe("REGISTERED");
    }
  });

  it("rows verified as retired/shut down are DEPRECATED and cite a source", () => {
    for (const id of ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "gemini-1.5-pro", "gemini-1.5-flash"]) {
      const m = listModels().find((x) => x.modelId === id)!;
      expect(m.lifecycle).toBe("DEPRECATED");
      expect(m.verification?.sources.length).toBeGreaterThan(0);
      expect(resolveModelAvailability(m)).toBe("DEPRECATED");
    }
  });

  it("deprecated models are never returned as AVAILABLE, regardless of provider configuration", () => {
    const deprecatedFixture: ModelDefinition = {
      provider: "openai",
      modelId: "fixture-deprecated-model",
      displayName: "Fixture Deprecated Model",
      capabilities: ["TEXT_GENERATION"],
      contextWindowTokens: 4_096,
      maxOutputTokens: 1_024,
      speedTier: "MEDIUM",
      costTier: "MEDIUM",
      lifecycle: "DEPRECATED",
      metadataVerification: "UNVERIFIED_TRAINING_DATA",
    };
    // Even though openai is registered (real adapter present) and may be
    // configured in this test env, DEPRECATED must short-circuit before
    // any provider/health check runs.
    expect(resolveModelAvailability(deprecatedFixture)).toBe("DEPRECATED");
  });

  it("model availability reflects real provider configuration (UNAVAILABLE for an unregistered provider)", () => {
    const unregisteredProviderFixture: ModelDefinition = {
      provider: "grok",
      modelId: "fixture-unregistered-provider-model",
      displayName: "Fixture",
      capabilities: ["TEXT_GENERATION"],
      contextWindowTokens: 4_096,
      maxOutputTokens: 1_024,
      speedTier: "MEDIUM",
      costTier: "MEDIUM",
      lifecycle: "REGISTERED",
      metadataVerification: "VERIFIED_AGAINST_DOCS",
    };
    expect(resolveModelAvailability(unregisteredProviderFixture)).toBe("UNAVAILABLE");
  });

  it("getModel resolves a known model and returns undefined for an unknown one", () => {
    expect(getModel("openai", "gpt-4o")).toBeTruthy();
    expect(getModel("openai", "this-model-id-does-not-exist")).toBeUndefined();
  });
});
