import "server-only";
/**
 * src/modules/ai/core/routing/strategies.ts
 *
 * Deterministic ranking, not "AI-powered" routing. QUALITY: capability
 * breadth then context window. FAST: speed tier. COST_EFFICIENT: cost
 * tier. BALANCED: 40% speed / 40% cost / 20% capability breadth.
 *
 * PREFERRED CAPABILITIES: a strictly secondary tie-break, never the
 * primary sort key. `rankCandidates` sorts by strategy score first;
 * only when two candidates have an EXACTLY equal strategy score does
 * preferred-capability count break the tie. This is what keeps
 * preferredCapabilities a soft signal — it can never promote a
 * capability-poor-but-preferred model over a genuinely better-scoring
 * one under the chosen strategy, and it can never eliminate a candidate
 * that lacks a preferred capability (that's what requiredCapabilities,
 * enforced upstream in router.ts before this file ever runs, is for).
 */
import type { ModelDefinition } from "../types/model";
import type { AICapability } from "../types/capability";
import type { RoutingStrategy } from "../types/routing";

const SPEED_SCORE: Record<ModelDefinition["speedTier"], number> = { FAST: 3, MEDIUM: 2, SLOW: 1 };
const COST_SCORE: Record<ModelDefinition["costTier"], number> = { LOW: 3, MEDIUM: 2, HIGH: 1 };

function capabilityBreadthScore(model: ModelDefinition): number {
  return model.capabilities.length;
}

export function computeStrategyScore(model: ModelDefinition, strategy: RoutingStrategy): number {
  switch (strategy) {
    case "QUALITY":
      return capabilityBreadthScore(model) * 1_000_000 + model.contextWindowTokens;
    case "FAST":
      return SPEED_SCORE[model.speedTier];
    case "COST_EFFICIENT":
      return COST_SCORE[model.costTier];
    case "BALANCED":
      return SPEED_SCORE[model.speedTier] * 0.4 + COST_SCORE[model.costTier] * 0.4 + capabilityBreadthScore(model) * 0.2;
  }
}

export function countPreferredCapabilities(model: ModelDefinition, preferred: AICapability[] | undefined): number {
  if (!preferred || preferred.length === 0) return 0;
  return preferred.filter((cap) => model.capabilities.includes(cap)).length;
}

/**
 * Full ranking: primary key is the strategy score (descending); ties
 * (exactly equal score) are broken by preferred-capability count
 * (descending); remaining ties fall back to the model registry's
 * original definition order, for full determinism.
 */
export function rankCandidates(
  models: ModelDefinition[],
  strategy: RoutingStrategy,
  preferredCapabilities?: AICapability[]
): ModelDefinition[] {
  return models
    .map((item, index) => ({
      item,
      index,
      score: computeStrategyScore(item, strategy),
      prefScore: countPreferredCapabilities(item, preferredCapabilities),
    }))
    .sort((a, b) => b.score - a.score || b.prefScore - a.prefScore || a.index - b.index)
    .map((x) => x.item);
}

// Kept as named per-strategy helpers — some callers (and tests) want a
// single strategy's ranking without threading a strategy string through.
export function rankByQuality(models: ModelDefinition[]): ModelDefinition[] { return rankCandidates(models, "QUALITY"); }
export function rankByFast(models: ModelDefinition[]): ModelDefinition[] { return rankCandidates(models, "FAST"); }
export function rankByCostEfficient(models: ModelDefinition[]): ModelDefinition[] { return rankCandidates(models, "COST_EFFICIENT"); }
export function rankByBalanced(models: ModelDefinition[]): ModelDefinition[] { return rankCandidates(models, "BALANCED"); }
