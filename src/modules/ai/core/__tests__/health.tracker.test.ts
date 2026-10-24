import { describe, it, expect, beforeEach } from "vitest";
import { getProviderHealth, recordSuccess, recordFailure, isHealthAffectingError, __resetHealthStateForTests } from "@/modules/ai/core/policy/health.tracker";
describe("provider health tracker", () => {
  beforeEach(() => { __resetHealthStateForTests(); });
  it("starts UNKNOWN", () => { expect(getProviderHealth("p").status).toBe("UNKNOWN"); });
  it("success moves to HEALTHY", () => { recordSuccess("p"); expect(getProviderHealth("p").status).toBe("HEALTHY"); });
  it("single failure doesn't flip status", () => {
    recordFailure("p", "TIMEOUT");
    expect(getProviderHealth("p").status).toBe("UNKNOWN");
    expect(getProviderHealth("p").consecutiveFailures).toBe(1);
  });
  it("2+ failures -> DEGRADED", () => {
    recordFailure("p", "TIMEOUT"); recordFailure("p", "TIMEOUT");
    expect(getProviderHealth("p").status).toBe("DEGRADED");
  });
  it("5+ failures -> UNAVAILABLE", () => {
    for (let i = 0; i < 5; i++) recordFailure("p", "PROVIDER_UNAVAILABLE");
    expect(getProviderHealth("p").status).toBe("UNAVAILABLE");
  });
  it("success resets and restores HEALTHY", () => {
    recordFailure("p", "TIMEOUT"); recordFailure("p", "TIMEOUT");
    recordSuccess("p");
    expect(getProviderHealth("p").status).toBe("HEALTHY");
    expect(getProviderHealth("p").consecutiveFailures).toBe(0);
  });
  it("INVALID_REQUEST never affects health", () => {
    expect(isHealthAffectingError("INVALID_REQUEST")).toBe(false);
    for (let i = 0; i < 10; i++) recordFailure("p", "INVALID_REQUEST");
    expect(getProviderHealth("p").status).toBe("UNKNOWN");
  });
  it("SAFETY_REFUSAL/CONTEXT_LIMIT_EXCEEDED never affect health", () => {
    expect(isHealthAffectingError("SAFETY_REFUSAL")).toBe(false);
    expect(isHealthAffectingError("CONTEXT_LIMIT_EXCEEDED")).toBe(false);
  });
  it("genuine provider errors do affect health", () => {
    expect(isHealthAffectingError("RATE_LIMITED")).toBe(true);
    expect(isHealthAffectingError("AUTHENTICATION_ERROR")).toBe(true);
  });
  it("tracks providers independently", () => {
    for (let i = 0; i < 5; i++) recordFailure("a", "TIMEOUT");
    expect(getProviderHealth("a").status).toBe("UNAVAILABLE");
    expect(getProviderHealth("b").status).toBe("UNKNOWN");
  });
});
