/**
 * STATIC checks of prisma/migrations (Pre-5C gate). These read files only: they do NOT execute SQL and do NOT replace applying the
 * history to a real Postgres (see docs/DATABASE_MIGRATIONS.md). They catch the regressions that are cheap to catch:
 * a missing baseline, a wrong order, an edited applied migration, a table/enum in schema.prisma that no migration creates,
 * semicolons in comments (which break script splitting in some drivers), and the baseline absorbing 5B objects.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(__dirname, "../../..");
const migDir = path.join(root, "prisma/migrations");
const names = fs.readdirSync(migDir).filter((n) => fs.statSync(path.join(migDir, n)).isDirectory()).sort();
const sql = (n: string) => fs.readFileSync(path.join(migDir, n, "migration.sql"), "utf8");
const sha = (n: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(migDir, n, "migration.sql"))).digest("hex");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const all = names.map(sql).join("\n");

const BASELINE = "20261009000000_baseline_modules_1_4";
const PREFS = "20261010120000_add_business_ai_preferences";
const MEMORY = "20261011120000_add_business_memories";
const DESTRUCTIVE = /^(DROP |TRUNCATE |DELETE FROM |ALTER TABLE [^\n]* (DROP|ALTER) )/im;

describe("migration history", () => {
  it("is exactly baseline -> 5B.1 -> 5B.2, in lexical (= application) order", () => {
    expect(names).toEqual([BASELINE, PREFS, MEMORY]);
  });
  it("uses postgresql in migration_lock.toml", () => {
    expect(fs.readFileSync(path.join(migDir, "migration_lock.toml"), "utf8")).toMatch(/provider\s*=\s*"postgresql"/);
  });
  it("applied migrations are immutable: checksums are pinned (changing one needs a NEW migration, not an edit)", () => {
    expect(sha(BASELINE)).toBe("328990e11523561209c5be46061af39ce4312c979b85bf2fb4acf8a9676f5657");
    expect(sha(PREFS)).toBe("a85750ea84179ecb06d45fbd43fb644a194bd2ae10ecf5df819e2ee8228de174");
    expect(sha(MEMORY)).toBe("02603ca4419d03f7e29d5f77fc3d090e8989cf3fbcfa329e1500c457f4bfbde6");
  });
  it("baseline holds the 25 Modules 1-4 tables and 16 enums and none of the 5B objects", () => {
    const b = sql(BASELINE);
    expect(b.match(/^CREATE TABLE /gm)).toHaveLength(25);
    expect(b.match(/^CREATE TYPE /gm)).toHaveLength(16);
    expect(b).not.toMatch(/business_ai_preferences|business_memories|BusinessMemory|AIPreference|ResponseLength|FormalityLevel/i);
    expect(b).toMatch(/CREATE TABLE "business_profiles"/);
    expect(b).toMatch(/CREATE TABLE "users"/);
  });
  it("5B migrations create only their own objects", () => {
    expect(sql(PREFS).match(/^CREATE TABLE "([^"]+)"/gm)).toEqual(['CREATE TABLE "business_ai_preferences"']);
    expect(sql(MEMORY).match(/^CREATE TABLE "([^"]+)"/gm)).toEqual(['CREATE TABLE "business_memories"']);
    expect(sql(PREFS)).not.toMatch(DESTRUCTIVE); // ON DELETE CASCADE in foreign keys is fine; destructive statements are not
    expect(sql(MEMORY)).not.toMatch(DESTRUCTIVE);
  });
  it("every table mapped in schema.prisma is created by exactly one migration", () => {
    const tables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(tables.length).toBe(27);
    for (const t of tables) expect(all.match(new RegExp(`^CREATE TABLE "${t}"`, "gm")), t).toHaveLength(1);
  });
  it("every enum in schema.prisma is created by exactly one migration", () => {
    const enums = [...schema.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]!);
    expect(enums.length).toBe(20);
    for (const e of enums) expect(all.match(new RegExp(`^CREATE TYPE "${e}"`, "gm")), e).toHaveLength(1);
  });
  it("no migration declares a table or enum that schema.prisma does not know", () => {
    const tables = new Set([...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]));
    const enums = new Set([...schema.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]));
    for (const m of all.matchAll(/^CREATE TABLE "([^"]+)"/gm)) expect(tables.has(m[1]), m[1]).toBe(true);
    for (const m of all.matchAll(/^CREATE TYPE "([^"]+)"/gm)) expect(enums.has(m[1]), m[1]).toBe(true);
  });
  it("comment lines contain no semicolons (the driver adapter splits scripts on ';')", () => {
    for (const n of names) for (const line of sql(n).split("\n")) if (line.trimStart().startsWith("--")) expect(line, `${n}: ${line}`).not.toContain(";");
  });
  it("the baseline header documents the existing-install procedure", () => {
    const head = sql(BASELINE).split("\n").slice(0, 12).join("\n");
    expect(head).toContain("migrate resolve --applied 20261009000000_baseline_modules_1_4");
    expect(fs.existsSync(path.join(root, "docs/DATABASE_MIGRATIONS.md"))).toBe(true);
  });
});
