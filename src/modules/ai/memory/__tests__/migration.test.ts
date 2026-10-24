/**
 * Schema <-> migration consistency (static) and migration behaviour on a
 * REAL PostgreSQL engine (PGlite = PostgreSQL compiled to WASM).
 *
 * PROVES: the hand-derived SQL agrees with the BusinessMemory model in
 * prisma/schema.prisma, and executes with the expected defaults, enum,
 * length, foreign-key, cascade, set-null and index behaviour.
 * DOES NOT PROVE: that Prisma generates/accepts this SQL, that it applies
 * to the production server version, or that it applies on top of the real
 * `business_profiles` / `users` tables — here they are minimal stand-ins
 * with only an `id` primary key. Prisma tooling could not run here, and
 * Modules 1–4 still have no migration baseline.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = process.cwd();
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATIONS = path.join(ROOT, "prisma/migrations");
const dirs = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.endsWith("_add_business_memories")).map((d) => d.name);
const sql = readFileSync(path.join(MIGRATIONS, dirs[0] ?? "missing", "migration.sql"), "utf8");

function block(kind: "model" | "enum", name: string): string {
  const m = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`${kind} ${name} not found`);
  return m[1]!;
}
const model = block("model", "BusinessMemory");
const enumValues = (n: string) => block("enum", n).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));

describe("migration files", () => {
  it("exactly one 5B.2 migration, additive only, and it does not touch the 5B.1 migration", () => {
    expect(dirs).toHaveLength(1);
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bRENAME\b|ALTER TYPE/i);
    expect((sql.match(/ALTER TABLE "[^"]+"/g) ?? []).every((a) => a === 'ALTER TABLE "business_memories"')).toBe(true);
    expect(sql).not.toMatch(/business_ai_preferences/);
  });
  it("sorts after the 5B.1 migration", () => {
    const all = readdirSync(MIGRATIONS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    expect(all.indexOf(dirs[0]!)).toBeGreaterThan(all.findIndex((n) => n.endsWith("_add_business_ai_preferences")));
  });
});

describe("schema <-> migration consistency", () => {
  it("table name and enum values match the schema, in order", () => {
    expect(model).toContain('@@map("business_memories")');
    expect(sql).toContain('CREATE TABLE "business_memories"');
    for (const n of ["BusinessMemoryType", "BusinessMemoryStatus"]) {
      expect(sql).toContain(`CREATE TYPE "${n}" AS ENUM (${enumValues(n).map((v) => `'${v}'`).join(", ")});`);
    }
  });
  it("every scalar column exists with matching type, nullability and default", () => {
    const expected: Record<string, RegExp> = {
      id: /"id" TEXT NOT NULL,/,
      businessId: /"businessId" TEXT NOT NULL,/,
      type: /"type" "BusinessMemoryType" NOT NULL,/,
      status: /"status" "BusinessMemoryStatus" NOT NULL DEFAULT 'ACTIVE',/,
      label: /"label" VARCHAR\(120\),/,
      content: /"content" VARCHAR\(2000\) NOT NULL,/,
      metadata: /"metadata" JSONB NOT NULL DEFAULT '\{\}',/,
      expiresAt: /"expiresAt" TIMESTAMP\(3\),/,
      createdById: /"createdById" TEXT,/,
      updatedById: /"updatedById" TEXT,/,
      createdAt: /"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,/,
      updatedAt: /"updatedAt" TIMESTAMP\(3\) NOT NULL,/,
    };
    const relationFields = ["business", "createdBy", "updatedBy"];
    const fields = model.split("\n").map((l) => l.trim()).filter((l) => /^[a-z]\w*\s/.test(l) && !l.startsWith("@@") && !l.startsWith("//"))
      .map((l) => l.split(/\s+/)[0]!).filter((f) => !relationFields.includes(f));
    expect(fields.sort()).toEqual(Object.keys(expected).sort());
    for (const f of fields) expect(sql, `column ${f}`).toMatch(expected[f]!);
    expect(model).toMatch(/label\s+String\?\s+@db\.VarChar\(120\)/);
    expect(model).toMatch(/content\s+String\s+@db\.VarChar\(2000\)/);
    expect(model).toMatch(/metadata\s+Json\s+@default\("\{\}"\)/);
    expect(model).toMatch(/status\s+BusinessMemoryStatus\s+@default\(ACTIVE\)/);
  });
  it("primary key, index and foreign keys (names, targets, referential actions) match the schema", () => {
    expect(sql).toContain('CONSTRAINT "business_memories_pkey" PRIMARY KEY ("id")');
    expect(model).toContain("@@index([businessId, status, createdAt])");
    expect(sql).toContain('CREATE INDEX "business_memories_businessId_status_createdAt_idx" ON "business_memories"("businessId", "status", "createdAt");');
    expect(model).toMatch(/onDelete: Cascade/);
    expect(sql).toContain('"business_memories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE');
    expect(model.match(/onDelete: SetNull/g)).toHaveLength(2);
    expect(sql).toContain('"business_memories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE');
    expect(sql).toContain('"business_memories_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  });
  it("no uniqueness on content and no vector/embedding columns", () => {
    expect(model).not.toMatch(/@unique|@@unique/);
    expect(sql).not.toMatch(/UNIQUE|vector|embedding/i);
  });
  it("User and BusinessProfile carry the back-relations", () => {
    expect(block("model", "BusinessProfile")).toMatch(/memories\s+BusinessMemory\[\]/);
    expect(block("model", "User")).toMatch(/createdBusinessMemories\s+BusinessMemory\[\]/);
    expect(block("model", "User")).toMatch(/updatedBusinessMemories\s+BusinessMemory\[\]/);
  });
});

describe("migration executed on PGlite (embedded PostgreSQL, WASM)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('CREATE TABLE "business_profiles" ("id" TEXT NOT NULL, CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id"));'); // stand-in
    await db.exec('CREATE TABLE "users" ("id" TEXT NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id"));'); // stand-in
    await db.exec(sql);
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('DELETE FROM "business_memories"; DELETE FROM "business_profiles"; DELETE FROM "users";');
    await db.exec(`INSERT INTO "business_profiles"("id") VALUES ('biz_1'),('biz_2'); INSERT INTO "users"("id") VALUES ('u_1'),('u_2');`);
  });
  const ins = (id: string, businessId: string, cols = "", vals = "") =>
    db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","updatedAt"${cols ? "," + cols : ""}) VALUES ('${id}','${businessId}','BUSINESS_FACT','c',now()${vals ? "," + vals : ""});`);

  it("applies cleanly with defaults: status ACTIVE, metadata {}, nullable label/expiry/audit ids", async () => {
    await ins("m1", "biz_1");
    const r = await db.query<Record<string, unknown>>('SELECT * FROM "business_memories" WHERE "id"=\'m1\'');
    expect(r.rows[0]).toMatchObject({ status: "ACTIVE", metadata: {}, label: null, expiresAt: null, createdById: null, updatedById: null });
  });
  it("allows many memories per business and duplicate content (no uniqueness requirement)", async () => {
    await ins("m1", "biz_1"); await ins("m2", "biz_1");
    const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM "business_memories" WHERE "businessId"=\'biz_1\' AND "content"=\'c\'');
    expect(r.rows[0]!.n).toBe(2);
  });
  it("enum, NOT NULL and length constraints", async () => {
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","updatedAt") VALUES ('x','biz_1','RANDOM','c',now());`)).rejects.toThrow(/invalid input value for enum/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","updatedAt") VALUES ('x','biz_1','BUSINESS_FACT',NULL,now());`)).rejects.toThrow(/not-null/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","content","updatedAt") VALUES ('x','biz_1','c',now());`)).rejects.toThrow(/not-null/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","updatedAt") VALUES ('x','biz_1','BUSINESS_FACT','${"a".repeat(2001)}',now());`)).rejects.toThrow(/too long/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","label","updatedAt") VALUES ('x','biz_1','BUSINESS_FACT','c','${"a".repeat(121)}',now());`)).rejects.toThrow(/too long/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","metadata","updatedAt") VALUES ('x','biz_1','BUSINESS_FACT','c',NULL,now());`)).rejects.toThrow(/not-null/i);
    await expect(db.exec(`INSERT INTO "business_memories"("id","businessId","type","content","status","updatedAt") VALUES ('x','biz_1','BUSINESS_FACT','c','DELETED',now());`)).rejects.toThrow(/invalid input value for enum/i);
    await expect(ins("ok", "biz_1", '"content"', "'" + "a".repeat(2000) + "'").catch(() => "dup-col")).resolves.toBeDefined();
  });
  it("12. foreign key rejects a memory for a business that does not exist", async () => {
    await expect(ins("m1", "no_such_business")).rejects.toThrow(/foreign key/i);
  });
  it("deleting a business cascades to ITS memories only", async () => {
    await ins("m1", "biz_1"); await ins("m2", "biz_2");
    await db.exec(`DELETE FROM "business_profiles" WHERE "id"='biz_1';`);
    const r = await db.query<{ id: string }>('SELECT "id" FROM "business_memories" ORDER BY "id"');
    expect(r.rows.map((x) => x.id)).toEqual(["m2"]);
  });
  it("deleting a user keeps the memory and nulls the audit references (SET NULL)", async () => {
    await ins("m1", "biz_1", '"createdById","updatedById"', "'u_1','u_2'");
    await db.exec(`DELETE FROM "users" WHERE "id" IN ('u_1','u_2');`);
    const r = await db.query<{ createdById: string | null; updatedById: string | null }>('SELECT "createdById","updatedById" FROM "business_memories" WHERE "id"=\'m1\'');
    expect(r.rows[0]).toEqual({ createdById: null, updatedById: null });
    await expect(ins("m2", "biz_1", '"createdById"', "'no_such_user'")).rejects.toThrow(/foreign key/i);
  });
  it("the composite index exists on (businessId, status, createdAt)", async () => {
    const r = await db.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE tablename='business_memories' AND indexname='business_memories_businessId_status_createdAt_idx'`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.indexdef).toMatch(/\("businessId", status, "createdAt"\)/);
  });
});
