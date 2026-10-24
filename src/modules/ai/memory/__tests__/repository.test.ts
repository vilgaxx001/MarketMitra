/**
 * MOCKED-DATABASE tests: they prove the repository builds ownership-scoped
 * Prisma calls (businessId in every WHERE, never in update data). They do
 * NOT prove database behaviour — see migration.test.ts for the schema on
 * a real PostgreSQL engine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { businessMemory: m } }));

import * as repo from "../repository";

beforeEach(() => { Object.values(m).forEach((f) => f.mockReset()); });
const now = new Date("2026-06-01T00:00:00Z");

describe("12. ownership in database queries", () => {
  it("find / update / transition / delete all carry businessId in the same WHERE", async () => {
    m.findFirst.mockResolvedValue(null); m.updateMany.mockResolvedValue({ count: 1 }); m.deleteMany.mockResolvedValue({ count: 1 });
    await repo.findByIdInBusiness("m1", "biz1");
    expect(m.findFirst).toHaveBeenCalledWith({ where: { id: "m1", businessId: "biz1" } });
    await repo.updateActiveInBusiness("m1", "biz1", "u1", { content: "x" });
    expect(m.updateMany.mock.calls[0]![0].where).toEqual({ id: "m1", businessId: "biz1", status: "ACTIVE" });
    await repo.transitionStatus("m1", "biz1", "u1", "ACTIVE", "ARCHIVED");
    expect(m.updateMany.mock.calls[1]![0].where).toEqual({ id: "m1", businessId: "biz1", status: "ACTIVE" });
    await repo.deleteInBusiness("m1", "biz1");
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: "m1", businessId: "biz1" } });
  });
  it("updates stamp updatedById and never write businessId", async () => {
    m.updateMany.mockResolvedValue({ count: 1 });
    await repo.updateActiveInBusiness("m1", "biz1", "u9", { content: "x", label: null });
    const data = m.updateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({ content: "x", label: null, updatedById: "u9" });
    expect(data).not.toHaveProperty("businessId");
    expect(data).not.toHaveProperty("createdById");
  });
  it("returns false (not an error) when no owned row matched", async () => {
    m.updateMany.mockResolvedValue({ count: 0 }); m.deleteMany.mockResolvedValue({ count: 0 });
    expect(await repo.updateActiveInBusiness("m1", "biz1", "u", {})).toBe(false);
    expect(await repo.transitionStatus("m1", "biz1", "u", "ARCHIVED", "ACTIVE")).toBe(false);
    expect(await repo.deleteInBusiness("m1", "biz1")).toBe(false);
  });
  it("create connects the business and actor; caller data cannot override ownership", async () => {
    m.create.mockResolvedValue({});
    await repo.create("biz1", "u1", { type: "BUSINESS_FACT", content: "c", label: null, metadata: {}, expiresAt: null });
    const arg = m.create.mock.calls[0]![0];
    expect(arg.data.business).toEqual({ connect: { id: "biz1" } });
    expect(arg.data.createdBy).toEqual({ connect: { id: "u1" } });
    expect(arg.data.updatedBy).toEqual({ connect: { id: "u1" } });
  });
});

describe("list: filters and no N+1", () => {
  it("active = ACTIVE and (no expiry or expiry in the future), scoped to the business", async () => {
    m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0);
    await repo.list("biz1", { view: "active", limit: 50, offset: 0, now });
    expect(m.findMany.mock.calls[0]![0].where).toEqual({ businessId: "biz1", status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
    expect(m.count.mock.calls[0]![0].where).toEqual(m.findMany.mock.calls[0]![0].where);
  });
  it("archived and all views, with type filter, pagination and stable ordering", async () => {
    m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0);
    await repo.list("biz1", { view: "archived", type: "BUSINESS_GOAL", limit: 10, offset: 20, now });
    expect(m.findMany.mock.calls[0]![0]).toMatchObject({ where: { businessId: "biz1", type: "BUSINESS_GOAL", status: "ARCHIVED" }, take: 10, skip: 20, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    await repo.list("biz1", { view: "all", limit: 5, offset: 0, now });
    expect(m.findMany.mock.calls[1]![0].where).toEqual({ businessId: "biz1" });
  });
  it("a list is exactly two queries regardless of size", async () => {
    m.findMany.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` }))); m.count.mockResolvedValue(100);
    await repo.list("biz1", { view: "all", limit: 100, offset: 0, now });
    expect(m.findMany).toHaveBeenCalledTimes(1);
    expect(m.count).toHaveBeenCalledTimes(1);
  });
});
