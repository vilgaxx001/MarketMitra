/**
 * ROUTE-HANDLER tests with doubles: authentication (requireWorkspaceAccess)
 * and the memory service are mocked; withApiHandler, requirePermission and
 * the Zod validators are REAL. They prove ordering (auth -> permission ->
 * validation -> service), safe error envelopes and malformed/oversized
 * input handling — not database behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/middleware/require-auth", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/modules/ai/memory/service", () => ({
  createBusinessMemory: vi.fn(), listBusinessMemories: vi.fn(), getBusinessMemory: vi.fn(), updateBusinessMemory: vi.fn(),
  archiveBusinessMemory: vi.fn(), restoreBusinessMemory: vi.fn(), deleteBusinessMemory: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { ApiException } from "@/lib/api-response";
import * as svc from "@/modules/ai/memory/service";
import * as collection from "@/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/route";
import * as item from "@/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]/route";
import * as archive from "@/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]/archive/route";
import * as restore from "@/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-memories/[memoryId]/restore/route";
import type { WorkspaceUser } from "@/modules/auth/types";

const user = (workspaceRole: string): WorkspaceUser => ({ id: "u1", workspaceId: "ws1", workspaceRole, platformRole: "USER" } as unknown as WorkspaceUser);
const MID = "clh3x0000000008l4abcd1234";
const ctx = (extra: object = {}) => ({ params: Promise.resolve({ workspaceSlug: "acme", businessId: "biz1", memoryId: MID, ...extra }) });
const post = (body: unknown, raw = false) => new Request("http://x/api", { method: "POST", body: raw ? (body as string) : JSON.stringify(body), headers: { "content-type": "application/json" } });
const get = (qs = "") => new Request(`http://x/api${qs}`);
const valid = { type: "BUSINESS_FACT", content: "We ship in 24h." };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("ADMIN"));
});

describe("6. unauthenticated / non-member", () => {
  it("authentication failure stops everything before validation or the service", async () => {
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(new ApiException("UNAUTHENTICATED", "Sign in required."));
    const res = await collection.POST(post(valid), ctx());
    expect(res.status).toBe(401);
    expect(svc.createBusinessMemory).not.toHaveBeenCalled();
  });
  it("7. a workspace the user is not a member of (requireWorkspaceAccess denies) never reaches the service", async () => {
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(new ApiException("FORBIDDEN", "No access."));
    for (const r of [await collection.GET(get(), ctx()), await item.GET(get(), ctx({ memoryId: MID })), await item.DELETE(get(), ctx({ memoryId: MID }))]) expect(r.status).toBe(403);
    expect(vi.mocked(svc.listBusinessMemories)).not.toHaveBeenCalled();
    expect(vi.mocked(svc.getBusinessMemory)).not.toHaveBeenCalled();
    expect(vi.mocked(svc.deleteBusinessMemory)).not.toHaveBeenCalled();
  });
});

describe("15. RBAC enforced on every route, before validation and the service", () => {
  it.each([
    ["TEAM_MEMBER", "create", () => collection.POST(post(valid), ctx()), 403],
    ["TEAM_MEMBER", "edit", () => item.PATCH(post({ content: "x" }), ctx({ memoryId: MID })), 403],
    ["TEAM_MEMBER", "archive", () => archive.POST(post({}), ctx({ memoryId: MID })), 403],
    ["TEAM_MEMBER", "restore", () => restore.POST(post({}), ctx({ memoryId: MID })), 403],
    ["TEAM_MEMBER", "delete", () => item.DELETE(get(), ctx({ memoryId: MID })), 403],
    ["CLIENT", "list", () => collection.GET(get(), ctx()), 403],
    ["CLIENT", "get", () => item.GET(get(), ctx({ memoryId: MID })), 403],
  ])("%s cannot %s", async (role, _op, call, status) => {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user(role));
    expect((await (call as () => Promise<Response>)()).status).toBe(status);
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled();
  });
  it("a TEAM_MEMBER can read (list and get)", async () => {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("TEAM_MEMBER"));
    vi.mocked(svc.listBusinessMemories).mockResolvedValue({ items: [], totalCount: 0, limit: 50, offset: 0 });
    vi.mocked(svc.getBusinessMemory).mockResolvedValue({ id: MID } as never);
    expect((await collection.GET(get(), ctx())).status).toBe(200);
    expect((await item.GET(get(), ctx({ memoryId: MID }))).status).toBe(200);
  });
  it("a permission failure does not leak whether the target exists (service never called)", async () => {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("CLIENT"));
    const res = await item.GET(get(), ctx({ memoryId: MID }));
    expect(res.status).toBe(403);
    expect(svc.getBusinessMemory).not.toHaveBeenCalled();
  });
});

describe("input validation at the route", () => {
  it("creates with 201 and passes the AUTHORIZED workspace id and actor, not client values", async () => {
    vi.mocked(svc.createBusinessMemory).mockResolvedValue({ id: MID } as never);
    const res = await collection.POST(post(valid), ctx());
    expect(res.status).toBe(201);
    expect(svc.createBusinessMemory).toHaveBeenCalledWith("biz1", "ws1", "u1", expect.objectContaining({ type: "BUSINESS_FACT" }));
  });
  it("2/3/4. invalid type, oversized content and bad metadata => 400 VALIDATION_ERROR, service untouched", async () => {
    for (const body of [{ ...valid, type: "NOPE" }, { ...valid, content: "a".repeat(2001) }, { ...valid, metadata: { a: { b: 1 } } }]) {
      const res = await collection.POST(post(body), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(svc.createBusinessMemory).not.toHaveBeenCalled();
  });
  it("9. a body trying to set businessId/status/createdById is rejected, not silently applied", async () => {
    for (const extra of [{ businessId: "other" }, { status: "ARCHIVED" }, { createdById: "u9" }]) {
      expect((await collection.POST(post({ ...valid, ...extra }), ctx())).status).toBe(400);
      expect((await item.PATCH(post({ content: "x", ...extra }), ctx({ memoryId: MID }))).status).toBe(400);
    }
    expect(svc.createBusinessMemory).not.toHaveBeenCalled();
    expect(svc.updateBusinessMemory).not.toHaveBeenCalled();
  });
  it("malformed JSON and oversized bodies are 400, never 500", async () => {
    const bad = await collection.POST(post("{not json", true), ctx());
    expect(bad.status).toBe(400);
    const big = await collection.POST(post(JSON.stringify({ ...valid, content: "a".repeat(20_000) }), true), ctx());
    expect(big.status).toBe(400);
    const declared = new Request("http://x/api", { method: "POST", body: "{}", headers: { "content-length": "999999" } });
    expect((await collection.POST(declared, ctx())).status).toBe(400);
  });
  it("both body-reading routes (POST collection, PATCH item) use the bounded byte reader: an oversized streamed body with no Content-Length is a 400 and never reaches validation or the service", async () => {
    const big = () => {
      const bytes = new TextEncoder().encode(JSON.stringify({ ...valid, content: "€".repeat(6000) })); // < 16384 chars, > 16384 bytes
      return new Request("http://x/api", { method: "POST", body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), duplex: "half" } as RequestInit & { duplex: "half" });
    };
    const created = await collection.POST(big(), ctx());
    const patched = await item.PATCH(big(), ctx({ memoryId: MID }));
    expect(created.status).toBe(400);
    expect(patched.status).toBe(400);
    expect((await created.json()).error.message).toBe("The request body is too large.");
    expect(svc.createBusinessMemory).not.toHaveBeenCalled();
    expect(svc.updateBusinessMemory).not.toHaveBeenCalled();
  });
  it("a malformed memory id is rejected before any lookup", async () => {
    for (const r of [await item.GET(get(), ctx({ memoryId: "../x" })), await item.DELETE(get(), ctx({ memoryId: "x" })), await archive.POST(post({}), ctx({ memoryId: "nope" }))]) expect(r.status).toBe(400);
    expect(svc.getBusinessMemory).not.toHaveBeenCalled();
    expect(svc.deleteBusinessMemory).not.toHaveBeenCalled();
    expect(svc.archiveBusinessMemory).not.toHaveBeenCalled();
  });
  it("list query is validated (bad view/limit => 400) and passes parsed values", async () => {
    expect((await collection.GET(get("?view=deleted"), ctx())).status).toBe(400);
    expect((await collection.GET(get("?limit=1000"), ctx())).status).toBe(400);
    vi.mocked(svc.listBusinessMemories).mockResolvedValue({ items: [], totalCount: 0, limit: 10, offset: 0 });
    expect((await collection.GET(get("?view=all&limit=10"), ctx())).status).toBe(200);
    expect(vi.mocked(svc.listBusinessMemories).mock.calls[0]![2]).toMatchObject({ view: "all", limit: 10, offset: 0 });
  });
});

describe("safe error envelopes", () => {
  it("13. NOT_FOUND from the service is a 404 with a generic message", async () => {
    vi.mocked(svc.getBusinessMemory).mockRejectedValue(new ApiException("NOT_FOUND", "Memory not found."));
    const res = await item.GET(get(), ctx({ memoryId: MID }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Memory not found." } });
  });
  it("an unexpected internal/database error becomes a generic 500 without leaking details", async () => {
    vi.mocked(svc.getBusinessMemory).mockRejectedValue(new Error('relation "business_memories" does not exist (password=hunter2)'));
    const res = await item.GET(get(), ctx({ memoryId: MID }));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/business_memories|hunter2|relation/);
  });
});
