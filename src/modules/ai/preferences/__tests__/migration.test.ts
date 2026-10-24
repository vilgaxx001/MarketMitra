/**
 * Schema <-> migration consistency (static) and migration behaviour on a
 * real PostgreSQL engine.
 *
 * WHAT THIS PROVES: the hand-derived migration SQL agrees with the
 * BusinessAIPreferences definition in prisma/schema.prisma, and executes on
 * PGlite (PostgreSQL compiled to WASM) with the expected defaults,
 * unique, foreign-key and cascade behaviour.
 * WHAT IT DOES NOT PROVE: that Prisma generates/accepts this SQL, that it
 * applies to the production server version, or that it applies on top of the
 * real `business_profiles` table — here `business_profiles` is a minimal
 * stand-in with only an `id` primary key. Prisma tooling could not run in
 * the authoring environment.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = process.cwd();
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATIONS_DIR = path.join(ROOT, "prisma/migrations");
const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).filter((n) => n.includes("add_business_ai_preferences"));
const sql = readFileSync(path.join(MIGRATIONS_DIR, migrationDirs[0] ?? "missing", "migration.sql"), "utf8");

function block(kind: "model" | "enum", name: string): string {
  const m = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`${kind} ${name} not found in schema`);
  return m[1]!;
}
const model = block("model", "BusinessAIPreferences");
const enumValues = (name: string) => block("enum", name).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("///"));

describe("migration files", () => {
  it("exactly one migration exists for this change, with a postgresql lock file", () => {
    expect(migrationDirs).toHaveLength(1);
    expect(existsSync(path.join(MIGRATIONS_DIR, "migration_lock.toml"))).toBe(true);
    expect(readFileSync(path.join(MIGRATIONS_DIR, "migration_lock.toml"), "utf8")).toContain('provider = "postgresql"');
  });
  it("is additive only: no DROP / destructive statements and no ALTER of existing tables except adding this FK", () => {
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bRENAME\b/i);
    const alters = sql.match(/ALTER TABLE "[^"]+"/g) ?? [];
    expect(alters).toEqual(['ALTER TABLE "business_ai_preferences"']);
    expect(sql).not.toMatch(/ALTER TYPE/i);
  });
});

describe("schema <-> migration consistency", () => {
  it("table name matches @@map", () => {
    expect(model).toContain('@@map("business_ai_preferences")');
    expect(sql).toContain('CREATE TABLE "business_ai_preferences"');
  });
  it("enum values match the schema, in order", () => {
    for (const name of ["AIDetailLevel", "AIFormattingPreference"]) {
      const values = enumValues(name);
      expect(sql).toContain(`CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(", ")});`);
    }
  });
  it("every scalar column in the model exists in the SQL with matching nullability and defaults", () => {
    const expected: Record<string, RegExp> = {
      id: /"id" TEXT NOT NULL,/,
      businessId: /"businessId" TEXT NOT NULL,/,
      detailLevel: /"detailLevel" "AIDetailLevel" NOT NULL DEFAULT 'STANDARD',/,
      formatting: /"formatting" "AIFormattingPreference" NOT NULL DEFAULT 'NO_PREFERENCE',/,
      businessInstructions: /"businessInstructions" VARCHAR\(1000\),/,
      behaviorConstraints: /"behaviorConstraints" TEXT\[\] NOT NULL DEFAULT ARRAY\[\]::TEXT\[\],/,
      createdAt: /"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP,/,
      updatedAt: /"updatedAt" TIMESTAMP\(3\) NOT NULL,/,
    };
    const fields = model.split("\n").map((l) => l.trim()).filter((l) => /^[a-z]\w*\s/.test(l) && !l.startsWith("@@") && !l.startsWith("//"))
      .map((l) => l.split(/\s+/)[0]!).filter((f) => f !== "business"); // `business` is the relation field, not a column
    expect(fields.sort()).toEqual(Object.keys(expected).sort());
    for (const f of fields) expect(sql, `column ${f}`).toMatch(expected[f]!);
    // schema-side expectations the SQL encodes
    expect(model).toMatch(/businessInstructions\s+String\?\s+@db\.VarChar\(1000\)/);
    expect(model).toMatch(/businessId\s+String\s+@unique/);
    expect(model).toMatch(/onDelete: Cascade/);
    expect(model).toMatch(/detailLevel\s+AIDetailLevel\s+@default\(STANDARD\)/);
    expect(model).toMatch(/formatting\s+AIFormattingPreference\s+@default\(NO_PREFERENCE\)/);
  });
  it("primary key, unique index and cascading foreign key follow Prisma naming", () => {
    expect(sql).toContain('CONSTRAINT "business_ai_preferences_pkey" PRIMARY KEY ("id")');
    expect(sql).toContain('CREATE UNIQUE INDEX "business_ai_preferences_businessId_key" ON "business_ai_preferences"("businessId");');
    expect(sql).toContain('CONSTRAINT "business_ai_preferences_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  });
  it("BusinessProfile carries the one-to-one relation back to the preferences", () => {
    expect(block("model", "BusinessProfile")).toMatch(/aiPreferences\s+BusinessAIPreferences\?/);
  });
});

describe("migration executed on PGlite (embedded PostgreSQL, WASM)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec('CREATE TABLE "business_profiles" ("id" TEXT NOT NULL, CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id"));'); // stand-in
    await db.exec(sql);
  });
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('DELETE FROM "business_ai_preferences"; DELETE FROM "business_profiles";');
    await db.exec(`INSERT INTO "business_profiles"("id") VALUES ('biz_1'), ('biz_2');`);
  });
  const insert = (id: string, businessId: string, extra = "") => db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","updatedAt"${extra ? "," + extra.split("=")[0] : ""}) VALUES ('${id}','${businessId}',now()${extra ? "," + extra.split("=")[1] : ""});`);

  it("applies cleanly and applies documented defaults", async () => {
    await insert("p1", "biz_1");
    const r = await db.query<{ detailLevel: string; formatting: string; businessInstructions: string | null; behaviorConstraints: string[] }>('SELECT * FROM "business_ai_preferences" WHERE "id"=\'p1\'');
    expect(r.rows[0]).toMatchObject({ detailLevel: "STANDARD", formatting: "NO_PREFERENCE", businessInstructions: null, behaviorConstraints: [] });
  });
  it("behaviorConstraints is NOT NULL: omitting it applies the empty-array default, explicit NULL is rejected", async () => {
    await insert("p1", "biz_1"); // column omitted
    const r = await db.query<{ behaviorConstraints: string[] | null }>('SELECT "behaviorConstraints" FROM "business_ai_preferences" WHERE "id"=\'p1\'');
    expect(r.rows[0]!.behaviorConstraints).toEqual([]);
    await expect(db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","behaviorConstraints","updatedAt") VALUES ('p2','biz_2',NULL,now());`)).rejects.toThrow(/null value in column "behaviorConstraints".*not-null constraint/i);
    await expect(db.exec(`UPDATE "business_ai_preferences" SET "behaviorConstraints"=NULL WHERE "id"='p1';`)).rejects.toThrow(/not-null constraint/i);
    await expect(db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","behaviorConstraints","updatedAt") VALUES ('p3','biz_2',ARRAY['No discounts'],now());`)).resolves.toBeDefined();
  });
  it("businessId is unique: a second row for the same business is rejected", async () => {
    await insert("p1", "biz_1");
    await expect(insert("p2", "biz_1")).rejects.toThrow(/duplicate key|unique/i);
    await expect(insert("p3", "biz_2")).resolves.toBeDefined();
  });
  it("foreign key rejects a preference row for a business that does not exist", async () => {
    await expect(insert("p1", "no_such_business")).rejects.toThrow(/foreign key/i);
  });
  it("deleting a business cascades to its preference row only", async () => {
    await insert("p1", "biz_1"); await insert("p2", "biz_2");
    await db.exec(`DELETE FROM "business_profiles" WHERE "id"='biz_1';`);
    const r = await db.query<{ id: string }>('SELECT "id" FROM "business_ai_preferences" ORDER BY "id"');
    expect(r.rows.map((x) => x.id)).toEqual(["p2"]);
  });
  it("enum columns reject values outside the enum, and instructions over 1000 chars are rejected", async () => {
    await expect(db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","detailLevel","updatedAt") VALUES ('p1','biz_1','HUGE',now());`)).rejects.toThrow(/invalid input value for enum/i);
    await expect(db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","businessInstructions","updatedAt") VALUES ('p1','biz_1','${"a".repeat(1001)}',now());`)).rejects.toThrow(/too long|value too long/i);
    await expect(db.exec(`INSERT INTO "business_ai_preferences"("id","businessId","businessInstructions","updatedAt") VALUES ('p1','biz_1','${"a".repeat(1000)}',now());`)).resolves.toBeDefined();
  });
});
