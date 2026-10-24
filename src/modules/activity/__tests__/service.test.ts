/** Pre-5C gate regression: audit-log Json column typing. MOCKED db (Prisma client types are real, the engine is absent). */
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { auditLog: { create } } }));

import { Prisma } from "@prisma/client";
import { logActivity, toInputJsonObject, toInputJsonValue } from "../service";

beforeEach(() => { create.mockReset(); create.mockResolvedValue({}); });

describe("toInputJsonValue / toInputJsonObject", () => {
  it("keeps JSON primitives, arrays and nested objects", () => {
    expect(toInputJsonObject({ a: 1, b: "x", c: true, d: null, e: [1, "y", { z: false }], f: { g: { h: 2 } } }))
      .toEqual({ a: 1, b: "x", c: true, d: null, e: [1, "y", { z: false }], f: { g: { h: 2 } } });
  });
  it("drops undefined/function/symbol entries, converts Date/bigint, nulls non-finite numbers", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(toInputJsonObject({ u: undefined, fn: () => 1, sym: Symbol("s"), d, big: BigInt(7), nan: NaN, inf: Infinity, bad: new Date("nope") }))
      .toEqual({ d: "2026-01-02T03:04:05.000Z", big: "7", nan: null, inf: null, bad: null });
  });
  it("cannot recurse forever on a cyclic structure", () => {
    const a: Record<string, unknown> = { name: "a" }; a.self = a;
    const out = toInputJsonObject(a);
    expect(JSON.stringify(out)).toContain("[max depth]");
  });
  it("null in, null out", () => expect(toInputJsonObject(null)).toBeNull());
  it("the result is always JSON-serialisable", () => {
    const v = toInputJsonValue({ x: [new Date(0), BigInt(1), undefined, { y: NaN }] });
    expect(() => JSON.stringify(v)).not.toThrow();
  });
});

describe("logActivity -> audit_logs", () => {
  it("stores SQL NULL (Prisma.DbNull) when there is no metadata - a plain null is rejected by Prisma for Json columns", async () => {
    await logActivity({ workspaceId: "w1", actorId: "u1", action: "workspace.created" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data.metadata).toBe(Prisma.DbNull);
  });
  it("redacts secret-looking keys and normalises the rest", async () => {
    await logActivity({ workspaceId: "w1", actorId: null, action: "workspace.created", metadata: { businessId: "b1", apiKey: "sk-123", when: new Date(0), skip: undefined } });
    expect(create.mock.calls[0]![0].data.metadata).toEqual({ businessId: "b1", apiKey: "[redacted]", when: "1970-01-01T00:00:00.000Z" });
  });
});
