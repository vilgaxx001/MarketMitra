/**
 * MODULE 5B.5 regression (confirmed defect D3): the preferences PATCH and AI execute routes read the body
 * through the bounded reader. ROUTE-HANDLER tests with doubles: authentication, the preferences service and the
 * AI orchestrator are mocked; withApiHandler, requirePermission, the Zod validators and the body reader are REAL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
vi.mock("@/lib/middleware/require-auth", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/modules/ai/preferences/service", () => ({ getBusinessAIPreferences: vi.fn(), updateBusinessAIPreferences: vi.fn(), resetBusinessAIPreferences: vi.fn() }));
vi.mock("@/modules/ai/core/orchestrator", () => ({ executeAICoreRequest: vi.fn() }));

import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { ApiException } from "@/lib/api-response";
import * as prefsSvc from "@/modules/ai/preferences/service";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";
import * as prefsRoute from "@/app/api/v1/workspaces/[workspaceSlug]/businesses/[businessId]/ai-preferences/route";
import * as executeRoute from "@/app/api/v1/workspaces/[workspaceSlug]/ai/execute/route";
import type { WorkspaceUser } from "@/modules/auth/types";

const user = (workspaceRole: string): WorkspaceUser => ({ id: "u1", workspaceId: "ws1", workspaceRole, platformRole: "USER" } as unknown as WorkspaceUser);
const prefsCtx = { params: Promise.resolve({ workspaceSlug: "acme", businessId: "biz1" }) };
const execCtx = { params: Promise.resolve({ workspaceSlug: "acme" }) };
const body = (b: BodyInit | null, method = "PATCH") => new Request("http://x/api", { method, body: b, headers: { "content-type": "application/json" } });
const allLogged = () => JSON.stringify(Object.values(log).flatMap((f) => f.mock.calls.map((c) => [c[0]?.msg, c[0]?.err instanceof Error ? c[0].err.message : c[0]?.err])));
const json = async (res: Response) => (await res.json()) as { success?: boolean; error?: { code: string; message: string } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("ADMIN"));
  vi.mocked(prefsSvc.updateBusinessAIPreferences).mockResolvedValue({ businessId: "biz1" } as never);
  vi.mocked(executeAICoreRequest).mockResolvedValue({ traceId: "t", content: "ok", provider: "openai", modelId: "m", finishReason: "STOP", usage: { kind: "UNAVAILABLE" }, retryCount: 0, fallbackCount: 0, totalLatencyMs: 1 } as never);
});

describe("preferences PATCH body handling", () => {
  it("malformed JSON is a safe 400, not a 500, and nothing about the body reaches the logs", async () => {
    const res = await prefsRoute.PATCH(body('{"businessInstructions": SECRET-TEXT-123 more}'), prefsCtx);
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe("VALIDATION_ERROR");
    expect(allLogged()).not.toContain("SECRET");
    expect(log.error).not.toHaveBeenCalled();
    expect(prefsSvc.updateBusinessAIPreferences).not.toHaveBeenCalled();
  });
  it("an oversized body (> 32 KiB, counted in bytes) is rejected before parsing or validation", async () => {
    const huge = JSON.stringify({ businessInstructions: "x".repeat(40_000) });
    const res = await prefsRoute.PATCH(body(huge), prefsCtx);
    expect(res.status).toBe(400);
    expect((await json(res)).error?.message).toMatch(/too large/i);
    expect(prefsSvc.updateBusinessAIPreferences).not.toHaveBeenCalled();
  });
  it("multi-byte text is measured in bytes, not characters", async () => {
    const res = await prefsRoute.PATCH(body(JSON.stringify({ businessInstructions: "€".repeat(12_000) })), prefsCtx); // 12k chars but 36k bytes
    expect(res.status).toBe(400);
  });
  it("a missing body and a non-object JSON value are safe 400s", async () => {
    expect((await prefsRoute.PATCH(body(null), prefsCtx)).status).toBe(400);
    expect((await prefsRoute.PATCH(body("null"), prefsCtx)).status).toBe(400);
    expect((await prefsRoute.PATCH(body("[]"), prefsCtx)).status).toBe(400);
    expect(prefsSvc.updateBusinessAIPreferences).not.toHaveBeenCalled();
  });
  it("a legitimate body (the largest the validators allow) is accepted and the service receives the AUTHORIZED workspace id", async () => {
    const maxBody = { businessInstructions: "i".repeat(1000), behaviorConstraints: Array.from({ length: 10 }, () => "c".repeat(200)) };
    const res = await prefsRoute.PATCH(body(JSON.stringify(maxBody)), prefsCtx);
    expect(res.status).toBe(200);
    expect(prefsSvc.updateBusinessAIPreferences).toHaveBeenCalledWith("biz1", "ws1", "u1", expect.objectContaining({ businessInstructions: "i".repeat(1000) }));
  });
  it("ownership and audit fields in the body are rejected, never passed to the service", async () => {
    for (const extra of [{ businessId: "other" }, { workspaceId: "ws2" }, { id: "x" }, { updatedAt: "2026-01-01" }, { createdById: "u9" }]) {
      const res = await prefsRoute.PATCH(body(JSON.stringify({ detailLevel: "CONCISE", ...extra })), prefsCtx);
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(prefsSvc.updateBusinessAIPreferences).not.toHaveBeenCalled();
  });
  it("authentication and permission are checked BEFORE the body is read", async () => {
    let read = false;
    const spy = new Request("http://x", { method: "PATCH", body: "{}" });
    Object.defineProperty(spy, "body", { get() { read = true; return null; } });
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("CLIENT"));
    expect((await prefsRoute.PATCH(spy, prefsCtx)).status).toBe(403);
    expect(read).toBe(false);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(new ApiException("UNAUTHENTICATED", "Sign in required."));
    expect((await prefsRoute.PATCH(spy, prefsCtx)).status).toBe(401);
    expect(read).toBe(false);
  });
  it("a team member (read-only on preferences) cannot edit", async () => {
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("TEAM_MEMBER"));
    expect((await prefsRoute.PATCH(body(JSON.stringify({ detailLevel: "CONCISE" })), prefsCtx)).status).toBe(403);
  });
});

describe("AI execute POST body handling", () => {
  const msg = (text: string) => ({ messages: [{ role: "USER", text }] });
  it("malformed JSON is a safe 400 and the user's prompt text never reaches the logs", async () => {
    const res = await executeRoute.POST(body('{"messages":[{"role":"USER","text": PROMPT-SECRET-998 }]}', "POST"), execCtx);
    expect(res.status).toBe(400);
    expect(allLogged()).not.toContain("PROMPT-SECRET");
    expect(log.error).not.toHaveBeenCalled();
    expect(executeAICoreRequest).not.toHaveBeenCalled();
  });
  it("a body over 1 MiB is rejected before parsing, validation or any AI work", async () => {
    const res = await executeRoute.POST(body(JSON.stringify(msg("x".repeat(1_100_000))), "POST"), execCtx);
    expect(res.status).toBe(400);
    expect(executeAICoreRequest).not.toHaveBeenCalled();
  });
  it("the largest legitimate body (20 messages x 8,000 characters) fits and runs", async () => {
    const big = { messages: Array.from({ length: 20 }, () => ({ role: "USER", text: "a".repeat(8000) })) };
    const res = await executeRoute.POST(body(JSON.stringify(big), "POST"), execCtx);
    expect(res.status).toBe(200);
    expect(executeAICoreRequest).toHaveBeenCalledTimes(1);
  });
  it("the workspace id comes from the authorized user, never from the body", async () => {
    await executeRoute.POST(body(JSON.stringify({ ...msg("hello world"), workspaceId: "ws_EVIL" }), "POST"), execCtx).catch(() => undefined);
    const res = await executeRoute.POST(body(JSON.stringify(msg("hello world")), "POST"), execCtx);
    expect(res.status).toBe(200);
    expect(vi.mocked(executeAICoreRequest).mock.calls[0]![0].workspaceId).toBe("ws1");
    expect(vi.mocked(executeAICoreRequest).mock.calls[0]![1]).toMatchObject({ workspaceId: "ws1" });
  });
  it("unauthenticated and unauthorized callers never have their body read", async () => {
    let read = false;
    const spy = new Request("http://x", { method: "POST", body: "{}" });
    Object.defineProperty(spy, "body", { get() { read = true; return null; } });
    vi.mocked(requireWorkspaceAccess).mockResolvedValue(user("CLIENT"));
    expect((await executeRoute.POST(spy, execCtx)).status).toBe(403);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(new ApiException("UNAUTHENTICATED", "Sign in required."));
    expect((await executeRoute.POST(spy, execCtx)).status).toBe(401);
    expect(read).toBe(false);
  });
  it("businessId is required with requiresBusinessContext and must be a cuid", async () => {
    expect((await executeRoute.POST(body(JSON.stringify({ ...msg("hi there"), requiresBusinessContext: true }), "POST"), execCtx)).status).toBe(400);
    expect((await executeRoute.POST(body(JSON.stringify({ ...msg("hi there"), requiresBusinessContext: true, businessId: "not-a-cuid" }), "POST"), execCtx)).status).toBe(400);
    expect(executeAICoreRequest).not.toHaveBeenCalled();
  });
});
