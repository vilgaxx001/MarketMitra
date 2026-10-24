import { describe, it, expect } from "vitest";
import { rankCandidates, computeStrategyScore } from "@/modules/ai/core/routing/strategies";
import { routeRequest } from "@/modules/ai/core/routing/router";
import type { ModelDefinition } from "@/modules/ai/core/types/model";

function model(overrides: Partial<ModelDefinition> & Pick<ModelDefinition, "modelId">): ModelDefinition {
  return {
    provider: "openai",
    displayName: overrides.modelId,
    capabilities: ["TEXT_GENERATION"],
    contextWindowTokens: 100_000,
    maxOutputTokens: 4_096,
    speedTier: "MEDIUM",
    costTier: "MEDIUM",
    lifecycle: "REGISTERED",
    metadataVerification: "UNVERIFIED_TRAINING_DATA",
    ...overrides,
  };
}

describe("preferredCapabilities — soft ranking signal only", () => {
  // Two models with IDENTICAL strategy scores under FAST/COST_EFFICIENT
  // (same speedTier/costTier), differing only in whether they have the
  // preferred capability — the exact situation a tie-break exists for.
  const withVision = model({ modelId: "has-vision", capabilities: ["TEXT_GENERATION", "VISION"], speedTier: "FAST" });
  const withoutVision = model({ modelId: "no-vision", capabilities: ["TEXT_GENERATION"], speedTier: "FAST" });

  it("preferred capability influences ranking when strategy scores are otherwise tied", () => {
    // Registry order puts `withoutVision` FIRST — without a preference, it'd win the tie.
    const withoutPreference = rankCandidates([withoutVision, withVision], "FAST");
    expect(withoutPreference[0]!.modelId).toBe("no-vision");

    const withPreference = rankCandidates([withoutVision, withVision], "FAST", ["VISION"]);
    expect(withPreference[0]!.modelId).toBe("has-vision");
  });

  it("a missing preferred capability does NOT eliminate an otherwise valid candidate", () => {
    const ranked = rankCandidates([withoutVision, withVision], "FAST", ["VISION"]);
    expect(ranked.map((m) => m.modelId)).toContain("no-vision");
    expect(ranked.length).toBe(2);
  });

  it("preferred capability never overrides a genuinely better strategy score", () => {
    // `slowButPreferred` has the preferred capability but a strictly worse FAST score.
    const fastNoPref = model({ modelId: "fast-no-pref", speedTier: "FAST" });
    const slowButPreferred = model({ modelId: "slow-preferred", capabilities: ["TEXT_GENERATION", "VISION"], speedTier: "SLOW" });
    expect(computeStrategyScore(fastNoPref, "FAST")).toBeGreaterThan(computeStrategyScore(slowButPreferred, "FAST"));

    const ranked = rankCandidates([slowButPreferred, fastNoPref], "FAST", ["VISION"]);
    expect(ranked[0]!.modelId).toBe("fast-no-pref"); // strategy score wins; preference is only a tie-break
  });

  it("ranking with preferredCapabilities is deterministic across repeated calls", () => {
    const results = Array.from({ length: 5 }, () => rankCandidates([withoutVision, withVision], "FAST", ["VISION"]).map((m) => m.modelId));
    for (const r of results) expect(r).toEqual(results[0]);
  });
});

describe("preferredCapabilities through the real router", () => {
  it("required capability is still a hard filter — a preferred capability cannot rescue a candidate missing a REQUIRED one", () => {
    // fixture-anthropic-fast has no VISION. Requiring VISION must exclude it even if
    // TEXT_GENERATION is preferred and it would otherwise rank well.
    const result = routeRequest({
      requiredCapabilities: ["TEXT_GENERATION", "VISION"],
      preferredCapabilities: ["LONG_CONTEXT"],
      strategy: "FAST",
    });
    expect(result.selectedModelId).not.toBe("fixture-anthropic-fast");
  });

  it("preferredCapabilities is accepted end-to-end without changing the set of eligible candidates", () => {
    const without = routeRequest({ requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED" });
    const withPref = routeRequest({ requiredCapabilities: ["TEXT_GENERATION"], preferredCapabilities: ["VISION"], strategy: "BALANCED" });
    expect(withPref.candidateCount).toBe(without.candidateCount); // preference never changes who is eligible
  });
});
