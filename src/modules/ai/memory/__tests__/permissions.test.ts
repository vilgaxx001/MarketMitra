import { describe, it, expect } from "vitest";
import { can } from "@/modules/rbac/permissions";
import type { WorkspaceUser } from "@/modules/auth/types";

const u = (workspaceRole: string, platformRole = "USER") => ({ workspaceRole, platformRole } as unknown as WorkspaceUser);
const ACTIONS = ["ai-memory:read", "ai-memory:create", "ai-memory:edit", "ai-memory:delete"] as const;

describe("15. ai-memory permission mapping", () => {
  it("ADMIN: read, create, edit, delete", () => { for (const a of ACTIONS) expect(can(u("ADMIN"), a), a).toBe(true); });
  it("TEAM_MEMBER: read only", () => {
    expect(can(u("TEAM_MEMBER"), "ai-memory:read")).toBe(true);
    for (const a of ["ai-memory:create", "ai-memory:edit", "ai-memory:delete"] as const) expect(can(u("TEAM_MEMBER"), a), a).toBe(false);
  });
  it("CLIENT: nothing", () => { for (const a of ACTIONS) expect(can(u("CLIENT"), a), a).toBe(false); });
});
