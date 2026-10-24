import { describe, it, expect } from "vitest";
import { can } from "@/modules/rbac/permissions";
import type { WorkspaceUser } from "@/modules/auth/types";

const u = (workspaceRole: string, platformRole = "USER") => ({ workspaceRole, platformRole } as unknown as WorkspaceUser);

describe("ai-preferences permissions", () => {
  it("ADMIN can read and edit", () => { expect(can(u("ADMIN"), "ai-preferences:read")).toBe(true); expect(can(u("ADMIN"), "ai-preferences:edit")).toBe(true); });
  it("TEAM_MEMBER can read but not edit", () => { expect(can(u("TEAM_MEMBER"), "ai-preferences:read")).toBe(true); expect(can(u("TEAM_MEMBER"), "ai-preferences:edit")).toBe(false); });
  it("CLIENT can neither read nor edit", () => { expect(can(u("CLIENT"), "ai-preferences:read")).toBe(false); expect(can(u("CLIENT"), "ai-preferences:edit")).toBe(false); });
});
