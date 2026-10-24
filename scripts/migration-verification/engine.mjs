import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { bindMigrationAwareSqlAdapterFactory } from "@prisma/driver-adapter-utils";
import { SchemaEngine, version } from "@prisma/schema-engine-wasm";

export const NOFILTER = { externalTables: [], externalEnums: [] };
export function loadSchema(file) { return { files: [{ path: file, content: fs.readFileSync(file, "utf8") }] }; }
export function loadMigrations(dir) {
  const lock = path.join(dir, "migration_lock.toml");
  const names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort();
  return {
    baseDir: dir,
    lockfile: { path: "migration_lock.toml", content: fs.existsSync(lock) ? fs.readFileSync(lock, "utf8") : null },
    shadowDbInitScript: "",
    migrationDirectories: names.map((n) => ({ path: n, migrationFile: { path: "migration.sql", content: { tag: "ok", value: fs.readFileSync(path.join(dir, n, "migration.sql"), "utf8") } } })),
  };
}
export async function openEngine(url, schemaFile) {
  // Use discrete config fields (NOT connectionString): adapter-pg's connectToShadowDb() spreads this config and overrides
  // only `database`, and a connectionString would silently win and point the "shadow" database at the real one.
  const u = new URL(url);
  const cfg = { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: u.password ? decodeURIComponent(u.password) : undefined, database: u.pathname.slice(1), max: 2 };
  const pool = new pg.Pool(cfg);
  const factory = bindMigrationAwareSqlAdapterFactory(new PrismaPg(cfg));
  const adapter = factory; // the engine receives the factory (it connects/creates shadow DBs itself)
  const engine = await SchemaEngine.new({ datamodels: schemaFile ? loadSchema(schemaFile).files.map((f) => [f.path, f.content]) : undefined }, () => {}, adapter);
  return { engine, pool, version: version() };
}
