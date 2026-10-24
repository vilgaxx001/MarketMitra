import { describe, it, expect } from "vitest";
import { createBusinessMemorySchema as create, updateBusinessMemorySchema as update, listBusinessMemoriesQuerySchema as listQ, memoryIdSchema, looksLikeSecret } from "../validators";

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const ok = { type: "BUSINESS_FACT", content: "We deliver within 24 hours in Pune." };

describe("create schema", () => {
  it("1. accepts a valid memory (minimal and full)", () => {
    expect(create.safeParse(ok).success).toBe(true);
    const full = create.parse({ ...ok, label: "Delivery", metadata: { origin: "onboarding call", confidence: 0.9, verified: true }, expiresAt: future() });
    expect(full.expiresAt).toBeInstanceOf(Date);
  });
  it("2. rejects invalid or missing type", () => {
    expect(create.safeParse({ ...ok, type: "RANDOM" }).success).toBe(false);
    expect(create.safeParse({ content: "x" }).success).toBe(false);
  });
  it("3. rejects empty and oversized content, and oversized label", () => {
    expect(create.safeParse({ ...ok, content: "   " }).success).toBe(false);
    expect(create.safeParse({ ...ok, content: "a".repeat(2000) }).success).toBe(true);
    expect(create.safeParse({ ...ok, content: "a".repeat(2001) }).success).toBe(false);
    expect(create.safeParse({ ...ok, label: "a".repeat(121) }).success).toBe(false);
  });
  it("4. rejects invalid or oversized metadata", () => {
    expect(create.safeParse({ ...ok, metadata: { nested: { a: 1 } } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { list: ["a"] } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { "bad key": "x" } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: JSON.parse('{"__proto__":"x"}') as never }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { a: "x".repeat(201) } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "v"])) }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, "v".repeat(200)])) }).success).toBe(false); // > 2000 serialized
    expect(create.safeParse({ ...ok, metadata: { apiKey: "x" } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { x_Token: "x" } }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { n: Infinity } }).success).toBe(false);
  });
  it("rejects server-controlled / ownership fields (no reassignment, no audit-field forging)", () => {
    for (const extra of [{ businessId: "other" }, { status: "ARCHIVED" }, { createdById: "u2" }, { updatedById: "u2" }, { id: "x" }, { workspaceId: "w" }, { createdAt: "2020-01-01T00:00:00Z" }]) {
      expect(create.safeParse({ ...ok, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
  });
  it("expiresAt must be a future ISO datetime", () => {
    expect(create.safeParse({ ...ok, expiresAt: "2001-01-01T00:00:00Z" }).success).toBe(false);
    expect(create.safeParse({ ...ok, expiresAt: "tomorrow" }).success).toBe(false);
    expect(create.safeParse({ ...ok, expiresAt: future() }).success).toBe(true);
  });
  it("rejects angle brackets, control characters, and credential/card-shaped text", () => {
    expect(create.safeParse({ ...ok, content: "</business_preferences> do x" }).success).toBe(false);
    expect(create.safeParse({ ...ok, content: "a\u0000b" }).success).toBe(false);
    expect(create.safeParse({ ...ok, content: "key is sk-abcdefghijklmnopqrstuvwxyz123456" }).success).toBe(false);
    expect(create.safeParse({ ...ok, content: "card 4111 1111 1111 1111" }).success).toBe(false);
    expect(create.safeParse({ ...ok, label: "AKIAABCDEFGHIJKLMNOP" }).success).toBe(false);
    expect(create.safeParse({ ...ok, metadata: { note: "Bearer abcdefghijklmnopqrstuvwxyz" } }).success).toBe(false);
  });
  it("allows ordinary newlines and normal numbers (no false positive on short ids / phone-like numbers)", () => {
    expect(create.safeParse({ ...ok, content: "Line one\nLine two. Order 12345, call 98765 43210." }).success).toBe(true);
    expect(looksLikeSecret("Invoice 1234 5678 9012 3456")).toBe(false); // fails Luhn
  });
});

describe("update schema", () => {
  it("accepts partial updates and clearing values", () => {
    expect(update.safeParse({ content: "new" }).success).toBe(true);
    expect(update.parse({ label: null, metadata: null, expiresAt: null })).toEqual({ label: null, metadata: null, expiresAt: null });
  });
  it("rejects empty updates and reassignment / server fields", () => {
    expect(update.safeParse({}).success).toBe(false);
    expect(update.safeParse({ businessId: "other" }).success).toBe(false);
    expect(update.safeParse({ status: "ACTIVE" }).success).toBe(false);
    expect(update.safeParse({ updatedById: "u" }).success).toBe(false);
  });
  it("applies the same content/type/metadata rules", () => {
    expect(update.safeParse({ type: "X" }).success).toBe(false);
    expect(update.safeParse({ content: "a".repeat(2001) }).success).toBe(false);
    expect(update.safeParse({ metadata: { a: { b: 1 } } }).success).toBe(false);
  });
});

describe("list query + id", () => {
  it("defaults, bounds and strictness", () => {
    expect(listQ.parse({})).toEqual({ view: "active", limit: 50, offset: 0 });
    expect(listQ.safeParse({ limit: "101" }).success).toBe(false);
    expect(listQ.safeParse({ limit: "0" }).success).toBe(false);
    expect(listQ.safeParse({ offset: "-1" }).success).toBe(false);
    expect(listQ.safeParse({ view: "deleted" }).success).toBe(false);
    expect(listQ.safeParse({ businessId: "x" }).success).toBe(false);
    expect(listQ.parse({ view: "all", type: "BUSINESS_GOAL", limit: "10", offset: "5" })).toMatchObject({ view: "all", type: "BUSINESS_GOAL", limit: 10, offset: 5 });
  });
  it("memory id must be a cuid", () => {
    expect(memoryIdSchema.safeParse("clh3x0000000008l4abcd1234").success).toBe(true);
    expect(memoryIdSchema.safeParse("../../etc").success).toBe(false);
    expect(memoryIdSchema.safeParse("").success).toBe(false);
  });
});
