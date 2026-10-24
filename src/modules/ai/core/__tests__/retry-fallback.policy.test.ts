import { describe, it, expect } from "vitest";
import { isRetryableError, shouldRetry, computeBackoffMs, MAX_RETRIES_PER_MODEL, isRetryBlockedByOversizedRequest } from "@/modules/ai/core/policy/retry.policy";
import { isFallbackAllowed, hasReachedMaxAttempts, buildAttemptKey, MAX_PROVIDER_ATTEMPTS } from "@/modules/ai/core/policy/fallback.policy";

describe("retry policy", () => {
  it("classifies retryable codes", () => {
    expect(isRetryableError("RATE_LIMITED")).toBe(true);
    expect(isRetryableError("TIMEOUT")).toBe(true);
    expect(isRetryableError("PROVIDER_UNAVAILABLE")).toBe(true);
    expect(isRetryableError("NETWORK_ERROR")).toBe(true);
  });
  it("classifies non-retryable codes", () => {
    expect(isRetryableError("AUTHENTICATION_ERROR")).toBe(false);
    expect(isRetryableError("INVALID_REQUEST")).toBe(false);
    expect(isRetryableError("SAFETY_REFUSAL")).toBe(false);
  });
  it("never blindly retries oversized request", () => {
    expect(isRetryBlockedByOversizedRequest("CONTEXT_LIMIT_EXCEEDED")).toBe(true);
    expect(shouldRetry("CONTEXT_LIMIT_EXCEEDED", 0)).toBe(false);
  });
  it("stops after MAX_RETRIES_PER_MODEL", () => {
    expect(shouldRetry("TIMEOUT", MAX_RETRIES_PER_MODEL - 1)).toBe(true);
    expect(shouldRetry("TIMEOUT", MAX_RETRIES_PER_MODEL)).toBe(false);
  });
  it("never retries non-retryable code", () => { expect(shouldRetry("SAFETY_REFUSAL", 0)).toBe(false); });
  it("computeBackoffMs is bounded and grows", () => {
    const f = () => 1;
    const d0 = computeBackoffMs(0, f); const d1 = computeBackoffMs(1, f); const d2 = computeBackoffMs(2, f);
    expect(d0).toBeGreaterThan(0);
    expect(d1).toBeGreaterThanOrEqual(d0);
    expect(d2).toBeGreaterThanOrEqual(d1);
    expect(computeBackoffMs(50, f)).toBeLessThanOrEqual(4_000);
  });
  it("computeBackoffMs(0 random) yields 0", () => { expect(computeBackoffMs(3, () => 0)).toBe(0); });
});

describe("fallback policy", () => {
  it("never allows fallback for SAFETY_REFUSAL/INVALID_REQUEST", () => {
    expect(isFallbackAllowed("SAFETY_REFUSAL")).toBe(false);
    expect(isFallbackAllowed("INVALID_REQUEST")).toBe(false);
  });
  it("allows fallback for provider-specific errors", () => {
    expect(isFallbackAllowed("RATE_LIMITED")).toBe(true);
    expect(isFallbackAllowed("PROVIDER_UNAVAILABLE")).toBe(true);
    expect(isFallbackAllowed("MODEL_UNAVAILABLE")).toBe(true);
  });
  it("blocks fallback for router terminal codes", () => {
    expect(isFallbackAllowed("NO_COMPATIBLE_MODEL")).toBe(false);
    expect(isFallbackAllowed("ALL_CANDIDATES_EXHAUSTED")).toBe(false);
  });
  it("enforces max-attempts bound", () => {
    const a = new Set<string>();
    expect(hasReachedMaxAttempts(a)).toBe(false);
    for (let i = 0; i < MAX_PROVIDER_ATTEMPTS; i++) a.add(buildAttemptKey("openai", `m-${i}`));
    expect(hasReachedMaxAttempts(a)).toBe(true);
  });
  it("same combo produces same key", () => {
    expect(buildAttemptKey("openai", "gpt-4o")).toBe(buildAttemptKey("openai", "gpt-4o"));
    expect(buildAttemptKey("openai", "gpt-4o")).not.toBe(buildAttemptKey("anthropic", "gpt-4o"));
  });
});
