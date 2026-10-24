/**
 * MOCKED-DATABASE tests: prove the retrieval repository builds a business-scoped,
 * bounded, ACTIVE/non-expired Prisma query. They do NOT prove database behaviour
 * (no real PostgreSQL executes this Prisma call in this environment).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { businessMemory: m } }));

import { findRetrievalCandidates } from "../retrieval.repository";

const now = new Date("2026-06-01T00:00:00Z");
beforeEach(() => { m.findMany.mockReset(); m.findMany.mockResolvedValue([]); });

describe("retrieval repository query shape", () => {
  it("7. businessId is in the same WHERE as every other predicate (no fetch-then-filter)", async () => {
    await findRetrievalCandidates("biz1", { now, limit: 500 });
    const arg = m.findMany.mock.calls[0]![0];
    expect(arg.where.businessId).toBe("biz1");
    expect(m.findMany).toHaveBeenCalledTimes(1);
  });
  it("5/6. archived and expired memories are excluded in the query: ACTIVE and (expiresAt null OR > now)", async () => {
    await findRetrievalCandidates("biz1", { now, limit: 500 });
    const { where } = m.findMany.mock.calls[0]![0];
    expect(where.status).toBe("ACTIVE");
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: now } }]);
  });
  it("4. type filter is applied only when given, as an IN list", async () => {
    await findRetrievalCandidates("biz1", { now, limit: 10 });
    expect(m.findMany.mock.calls[0]![0].where).not.toHaveProperty("type");
    await findRetrievalCandidates("biz1", { now, limit: 10, types: ["BUSINESS_GOAL", "BUSINESS_CONSTRAINT"] });
    expect(m.findMany.mock.calls[1]![0].where.type).toEqual({ in: ["BUSINESS_GOAL", "BUSINESS_CONSTRAINT"] });
  });
  it("is bounded, deterministic and selects only contract columns (no metadata / actor ids / businessId)", async () => {
    await findRetrievalCandidates("biz1", { now, limit: 123 });
    const arg = m.findMany.mock.calls[0]![0];
    expect(arg.take).toBe(123);
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.select).toEqual({ id: true, type: true, label: true, content: true, expiresAt: true, createdAt: true });
  });
  it("returns the rows from the database unchanged", async () => {
    const rows = [{ id: "a" }];
    m.findMany.mockResolvedValue(rows);
    expect(await findRetrievalCandidates("biz1", { now, limit: 5 })).toBe(rows);
  });
});
