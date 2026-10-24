import "server-only";
/**
 * src/modules/ai/core/providers/provider.registry.ts
 *
 * The only place a concrete provider adapter is resolved. openai/
 * anthropic/gemini have real adapters. grok/deepseek are NOT registered
 * — a fake adapter would be indistinguishable from a bug.
 *
 * TEST OVERRIDES: `__setTestProviderOverride`/`__clearTestProviderOverrides`
 * exist so orchestrator integration tests can substitute a deterministic
 * fake adapter behind a REAL, already-registered provider ID (see
 * orchestrator.test.ts) without inventing a fake AIProviderId or making
 * a real network call. `getProvider` checks overrides first. Production
 * code never calls these two functions — they are a no-op (empty map)
 * unless a test explicitly populates them.
 */
import { openAIProvider } from "./openai.provider";
import { anthropicProvider } from "./anthropic.provider";
import { geminiProvider } from "./gemini.provider";
import type { AIProvider, AIProviderId } from "../types/provider";

const registry = new Map<AIProviderId, AIProvider>();
function register(provider: AIProvider): void {
  if (registry.has(provider.id)) throw new Error(`Duplicate provider registration: "${provider.id}".`);
  registry.set(provider.id, provider);
}
register(openAIProvider);
register(anthropicProvider);
register(geminiProvider);

export const PROVIDER_REGISTRY_EXTENSION_POINT = "grok, deepseek — not registered" as const;

const testOverrides = new Map<AIProviderId, AIProvider>();

export function getProvider(id: AIProviderId): AIProvider | undefined {
  return testOverrides.get(id) ?? registry.get(id);
}
export function listProviders(): AIProvider[] { return Array.from(registry.values()); }
export function listRegisteredProviderIds(): AIProviderId[] { return Array.from(registry.keys()); }

/** Test-only. Substitutes a fake AIProvider behind a real, already-registered provider ID. */
export function __setTestProviderOverride(id: AIProviderId, provider: AIProvider): void {
  testOverrides.set(id, provider);
}
/** Test-only. Clears all overrides — call in afterEach/beforeEach so tests don't leak state into each other. */
export function __clearTestProviderOverrides(): void {
  testOverrides.clear();
}
