/**
 * Pre-5C gate regression: the dashboard resolver ordered WorkspaceMember by `createdAt`, a column that does not exist
 * (the model has `joinedAt`) - Prisma rejects that at runtime, so /dashboard would fail for every signed-in user.
 * Source-level + schema-level check (rendering the page needs the Next runtime, which is not available here).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = readFileSync(path.join(root, "src/app/dashboard/page.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const member = /model WorkspaceMember \{([\s\S]*?)\n\}/.exec(schema)![1]!;

describe("dashboard resolver query", () => {
  it("orders by a field that exists on WorkspaceMember", () => {
    const m = /workspaceMember\.findFirst\(\{[\s\S]*?orderBy:\s*\{\s*(\w+):/.exec(page);
    expect(m, "findFirst orderBy not found").not.toBeNull();
    expect(member).toMatch(new RegExp(`^\\s*${m![1]}\\s`, "m"));
    expect(m![1]).toBe("joinedAt");
    expect(member).not.toMatch(/^\s*createdAt\s/m);
  });
});
