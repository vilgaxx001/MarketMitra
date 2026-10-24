/** MOCKED service tests (repository, business lookup and activity log are test doubles). */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-response", () => ({
  ApiException: class ApiException extends Error { constructor(public code: string, message: string) { super(message); } },
}));
vi.mock("@/modules/activity/service", () => ({ logActivity: vi.fn() }));
vi.mock("@/modules/business/repository", () => ({ findByIdInWorkspace: vi.fn() }));
vi.mock("../repository", () => ({
  findByIdInBusiness: vi.fn(), countByBusiness: vi.fn(), list: vi.fn(), create: vi.fn(),
  updateActiveInBusiness: vi.fn(), transitionStatus: vi.fn(), deleteInBusiness: vi.fn(),
}));

import { logActivity } from "@/modules/activity/service";
import * as businessRepo from "@/modules/business/repository";
import * as repo from "../repository";
import {
  createBusinessMemory, listBusinessMemories, getBusinessMemory, updateBusinessMemory,
  archiveBusinessMemory, restoreBusinessMemory, deleteBusinessMemory,
} from "../service";

const SECRET_TEXT = "TOP-SECRET-CONTENT-9f3a";
const SECRET_LABEL = "TOP-SECRET-LABEL-77";
const row = (o: object = {}) => ({
  id: "m1", businessId: "biz1", type: "BUSINESS_FACT", status: "ACTIVE", label: null, content: "c", metadata: {}, expiresAt: null,
  createdById: "u1", updatedById: "u1", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(businessRepo.findByIdInWorkspace).mockResolvedValue({ id: "biz1" } as never);
  vi.mocked(repo.countByBusiness).mockResolvedValue(0);
});

describe("tenant isolation at the service boundary", () => {
  it("5/7. a business outside the caller's workspace (or missing) => NOT_FOUND for every operation, with no memory data touched or audited", async () => {
    vi.mocked(businessRepo.findByIdInWorkspace).mockResolvedValue(null);
    const rejects = { code: "NOT_FOUND" };
    await expect(createBusinessMemory("other", "ws1", "u1", { type: "BUSINESS_FACT", content: "x" })).rejects.toMatchObject(rejects);
    await expect(listBusinessMemories("other", "ws1", { view: "active", limit: 50, offset: 0 })).rejects.toMatchObject(rejects);
    await expect(getBusinessMemory("m1", "other", "ws1")).rejects.toMatchObject(rejects);
    await expect(updateBusinessMemory("m1", "other", "ws1", "u1", { content: "x" })).rejects.toMatchObject(rejects);
    await expect(archiveBusinessMemory("m1", "other", "ws1", "u1")).rejects.toMatchObject(rejects);
    await expect(restoreBusinessMemory("m1", "other", "ws1", "u1")).rejects.toMatchObject(rejects);
    await expect(deleteBusinessMemory("m1", "other", "ws1", "u1")).rejects.toMatchObject(rejects);
    expect(businessRepo.findByIdInWorkspace).toHaveBeenCalledWith("other", "ws1");
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("8/13. another business's memory id and a non-existent id are indistinguishable (same NOT_FOUND message) for read/update/archive/restore/delete", async () => {
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(null);
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(false);
    vi.mocked(repo.transitionStatus).mockResolvedValue(false);
    vi.mocked(repo.deleteInBusiness).mockResolvedValue(false);
    const calls = [
      () => getBusinessMemory("foreign", "biz1", "ws1"),
      () => updateBusinessMemory("foreign", "biz1", "ws1", "u1", { content: "x" }),
      () => archiveBusinessMemory("foreign", "biz1", "ws1", "u1"),
      () => restoreBusinessMemory("foreign", "biz1", "ws1", "u1"),
      () => deleteBusinessMemory("foreign", "biz1", "ws1", "u1"),
    ];
    for (const c of calls) await expect(c()).rejects.toMatchObject({ code: "NOT_FOUND", message: "Memory not found." });
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("record operations are always scoped by the URL's businessId, never by anything read from a row", async () => {
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ businessId: "SOMETHING_ELSE" }) as never);
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(true);
    vi.mocked(repo.transitionStatus).mockResolvedValue(true);
    vi.mocked(repo.deleteInBusiness).mockResolvedValue(true);
    await getBusinessMemory("m1", "biz1", "ws1");
    await updateBusinessMemory("m1", "biz1", "ws1", "u1", { content: "x" });
    await archiveBusinessMemory("m1", "biz1", "ws1", "u1");
    await deleteBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(vi.mocked(repo.findByIdInBusiness).mock.calls.every((c) => c[1] === "biz1")).toBe(true);
    expect(vi.mocked(repo.updateActiveInBusiness).mock.calls[0]![1]).toBe("biz1");
    expect(vi.mocked(repo.transitionStatus).mock.calls[0]![1]).toBe("biz1");
    expect(vi.mocked(repo.deleteInBusiness).mock.calls[0]![1]).toBe("biz1");
  });
  it("9. an update can never reassign the owning business or touch server fields (data passed to the repository has no ownership/audit keys)", async () => {
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(true);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row() as never);
    await updateBusinessMemory("m1", "biz1", "ws1", "u1", { content: "x", label: "L", metadata: { a: 1 }, expiresAt: null });
    const data = vi.mocked(repo.updateActiveInBusiness).mock.calls[0]![3];
    expect(Object.keys(data).sort()).toEqual(["content", "expiresAt", "label", "metadata"]);
  });
});

describe("create / get / list", () => {
  it("1. creates with defaults and audits without content", async () => {
    vi.mocked(repo.create).mockResolvedValue(row({ id: "m9" }) as never);
    const dto = await createBusinessMemory("biz1", "ws1", "u1", { type: "BUSINESS_FACT", content: SECRET_TEXT, label: SECRET_LABEL });
    expect(repo.create).toHaveBeenCalledWith("biz1", "u1", { type: "BUSINESS_FACT", content: SECRET_TEXT, label: SECRET_LABEL, metadata: {}, expiresAt: null });
    expect(dto).toMatchObject({ id: "m9", status: "ACTIVE", isExpired: false });
  });
  it("enforces the per-business cap", async () => {
    vi.mocked(repo.countByBusiness).mockResolvedValue(500);
    await expect(createBusinessMemory("biz1", "ws1", "u1", { type: "BUSINESS_FACT", content: "x" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("11. isExpired is computed at read time from expiresAt; nothing is deleted or archived", async () => {
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }) as never);
    expect(await getBusinessMemory("m1", "biz1", "ws1")).toMatchObject({ isExpired: true, status: "ACTIVE" });
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ expiresAt: new Date(Date.now() + 60_000) }) as never);
    expect((await getBusinessMemory("m1", "biz1", "ws1")).isExpired).toBe(false);
    expect(repo.deleteInBusiness).not.toHaveBeenCalled();
    expect(repo.transitionStatus).not.toHaveBeenCalled();
  });
  it("10. list passes the requested view to the repository (default active hides archived/expired) and reports totals", async () => {
    vi.mocked(repo.list).mockResolvedValue({ rows: [row(), row({ id: "m2", status: "ARCHIVED" })], totalCount: 7 } as never);
    const res = await listBusinessMemories("biz1", "ws1", { view: "archived", limit: 2, offset: 4 });
    expect(vi.mocked(repo.list).mock.calls[0]![0]).toBe("biz1");
    expect(vi.mocked(repo.list).mock.calls[0]![1]).toMatchObject({ view: "archived", limit: 2, offset: 4 });
    expect(res).toMatchObject({ totalCount: 7, limit: 2, offset: 4 });
    expect(res.items.map((i) => i.status)).toEqual(["ACTIVE", "ARCHIVED"]);
  });
});

describe("update lifecycle", () => {
  it("edits an ACTIVE memory (an expired one too — setting expiresAt re-activates it)", async () => {
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(true);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row() as never);
    await expect(updateBusinessMemory("m1", "biz1", "ws1", "u1", { expiresAt: null })).resolves.toBeDefined();
  });
  it("10. an ARCHIVED memory is read-only: 409 CONFLICT, distinct from NOT_FOUND, no audit", async () => {
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(false);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ status: "ARCHIVED" }) as never);
    await expect(updateBusinessMemory("m1", "biz1", "ws1", "u1", { content: "x" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("clears label/metadata with null or empty and stores metadata {} ", async () => {
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(true);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row() as never);
    await updateBusinessMemory("m1", "biz1", "ws1", "u1", { label: "", metadata: null });
    expect(vi.mocked(repo.updateActiveInBusiness).mock.calls[0]![3]).toEqual({ label: null, metadata: {} });
  });
});

describe("archive / restore / delete", () => {
  it("archive then restore audit once each; repeating a no-op transition is idempotent and unaudited", async () => {
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ status: "ARCHIVED" }) as never);
    vi.mocked(repo.transitionStatus).mockResolvedValueOnce(true);
    await archiveBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(repo.transitionStatus).toHaveBeenCalledWith("m1", "biz1", "u1", "ACTIVE", "ARCHIVED");
    expect(logActivity).toHaveBeenCalledTimes(1);
    vi.mocked(repo.transitionStatus).mockResolvedValueOnce(false);
    await archiveBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(logActivity).toHaveBeenCalledTimes(1);
    vi.mocked(repo.transitionStatus).mockResolvedValueOnce(true);
    await restoreBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(repo.transitionStatus).toHaveBeenLastCalledWith("m1", "biz1", "u1", "ARCHIVED", "ACTIVE");
    expect(vi.mocked(logActivity).mock.calls.map((c) => c[0].action)).toEqual(["ai_memory.archived", "ai_memory.restored"]);
  });
  it("restoring an elapsed-expiry memory does not extend it (still isExpired)", async () => {
    vi.mocked(repo.transitionStatus).mockResolvedValue(true);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }) as never);
    expect((await restoreBusinessMemory("m1", "biz1", "ws1", "u1")).isExpired).toBe(true);
  });
  it("delete is a permanent hard delete, audited once", async () => {
    vi.mocked(repo.deleteInBusiness).mockResolvedValue(true);
    await deleteBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "ai_memory.deleted", targetId: "m1" }));
  });
});

describe("14. activity logs never contain memory content, label or metadata values", () => {
  it("across create/update/archive/restore/delete", async () => {
    vi.mocked(repo.create).mockResolvedValue(row() as never);
    vi.mocked(repo.updateActiveInBusiness).mockResolvedValue(true);
    vi.mocked(repo.transitionStatus).mockResolvedValue(true);
    vi.mocked(repo.deleteInBusiness).mockResolvedValue(true);
    vi.mocked(repo.findByIdInBusiness).mockResolvedValue(row() as never);
    await createBusinessMemory("biz1", "ws1", "u1", { type: "BUSINESS_FACT", content: SECRET_TEXT, label: SECRET_LABEL, metadata: { note: SECRET_TEXT } });
    await updateBusinessMemory("m1", "biz1", "ws1", "u1", { content: SECRET_TEXT, label: SECRET_LABEL, metadata: { note: SECRET_TEXT } });
    await archiveBusinessMemory("m1", "biz1", "ws1", "u1");
    await restoreBusinessMemory("m1", "biz1", "ws1", "u1");
    await deleteBusinessMemory("m1", "biz1", "ws1", "u1");
    expect(vi.mocked(logActivity).mock.calls.length).toBe(5);
    const logged = JSON.stringify(vi.mocked(logActivity).mock.calls);
    expect(logged).not.toContain("TOP-SECRET");
    const update = vi.mocked(logActivity).mock.calls[1]![0];
    expect(update.metadata).toEqual({ businessId: "biz1", memoryId: "m1", fields: ["content", "label", "metadata"] });
  });
});
