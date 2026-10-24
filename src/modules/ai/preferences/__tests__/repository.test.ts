import { describe, it, expect, vi, beforeEach } from "vitest";

const { upsertMock, findUniqueMock, deleteManyMock } = vi.hoisted(() => ({ upsertMock: vi.fn(), findUniqueMock: vi.fn(), deleteManyMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { businessAIPreferences: { upsert: upsertMock, findUnique: findUniqueMock, deleteMany: deleteManyMock } } }));

import { upsert, findByBusinessId, deleteByBusinessId } from "../repository";

beforeEach(() => { upsertMock.mockReset(); findUniqueMock.mockReset(); deleteManyMock.mockReset(); });

describe("preferences repository", () => {
  it("upserts keyed on the unique businessId and connects the business on create", async () => {
    upsertMock.mockResolvedValue({ id: "p1" });
    await upsert("biz_1", { detailLevel: "CONCISE" });
    expect(upsertMock).toHaveBeenCalledWith({ where: { businessId: "biz_1" }, update: { detailLevel: "CONCISE" }, create: { business: { connect: { id: "biz_1" } }, detailLevel: "CONCISE" } });
  });
  it("retries once on a unique-constraint race (P2002), then succeeds via the update path", async () => {
    upsertMock.mockRejectedValueOnce({ code: "P2002" }).mockResolvedValueOnce({ id: "p1" });
    await expect(upsert("biz_1", { formatting: "MARKDOWN" })).resolves.toEqual({ id: "p1" });
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry other errors", async () => {
    upsertMock.mockRejectedValue(new Error("db down"));
    await expect(upsert("biz_1", {})).rejects.toThrow("db down");
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
  it("reads and deletes only by businessId", async () => {
    findUniqueMock.mockResolvedValue(null);
    await findByBusinessId("biz_1");
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { businessId: "biz_1" } });
    deleteManyMock.mockResolvedValue({ count: 1 });
    await expect(deleteByBusinessId("biz_1")).resolves.toBe(true);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { businessId: "biz_1" } });
    deleteManyMock.mockResolvedValue({ count: 0 });
    await expect(deleteByBusinessId("biz_1")).resolves.toBe(false);
  });
});
