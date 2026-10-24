/** Pre-5C gate regression: brand upsert builds SEPARATE create/update inputs. MOCKED db. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertFn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { brandIdentity: { upsert: upsertFn, findUnique: vi.fn() } } }));

import { upsert } from "../repository";

beforeEach(() => { upsertFn.mockReset(); upsertFn.mockResolvedValue({}); });
const args = () => upsertFn.mock.calls[0]![0];

describe("brand repository upsert", () => {
  it("removing the logo uses disconnect on UPDATE but never puts `disconnect` in CREATE (invalid there)", async () => {
    await upsert("biz1", { brandName: "Acme" }, null);
    expect(args().update).toEqual({ brandName: "Acme", logoAsset: { disconnect: true } });
    expect(args().create).toEqual({ business: { connect: { id: "biz1" } }, brandName: "Acme" });
    expect(JSON.stringify(args().create)).not.toContain("disconnect");
  });
  it("setting a logo connects it in both update and create", async () => {
    await upsert("biz1", {}, "casset00000000000000001");
    expect(args().update).toEqual({ logoAsset: { connect: { id: "casset00000000000000001" } } });
    expect(args().create).toEqual({ business: { connect: { id: "biz1" } }, logoAsset: { connect: { id: "casset00000000000000001" } } });
  });
  it("leaving the logo untouched (undefined) touches no logo relation", async () => {
    await upsert("biz1", { tone: "Friendly" });
    expect(args().update).toEqual({ tone: "Friendly" });
    expect(args().create).toEqual({ business: { connect: { id: "biz1" } }, tone: "Friendly" });
  });
  it("always scopes the upsert by the given businessId and includes the logo asset", async () => {
    await upsert("biz1", {});
    expect(args().where).toEqual({ businessId: "biz1" });
    expect(args().include).toEqual({ logoAsset: { include: { currentVersion: true } } });
  });
});
