/**
 * Every package that runtime source code imports must be declared in package.json `dependencies`.
 *
 * Regression for: `Module not found: Can't resolve 'nodemailer'` in the production build. src/lib/email.ts dynamically imported a
 * package that was never declared (only its types were, as a devDependency), so the SMTP provider the configuration advertises could not
 * work and the build warned on every run. A build WARNING is easy to overlook; this fails the test suite instead.
 *
 * Scope: files under src/ that are not tests. Type-only imports (erased at build time) may use a devDependency. Node built-ins, relative
 * paths and the `@/` alias are not packages.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

const ROOT = path.resolve(__dirname, "../../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
const RUNTIME = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]);
const DEV = new Set(Object.keys(pkg.devDependencies ?? {}));
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((b) => `node:${b}`)]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") sourceFiles(p, out); continue; }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
const packageName = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);

interface Use { file: string; pkg: string; typeOnly: boolean }
function importsOf(file: string): Use[] {
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const uses: Use[] = [];
  const add = (spec: string, typeOnly: boolean) => {
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/") || BUILTINS.has(spec)) return;
    uses.push({ file: path.relative(ROOT, file), pkg: packageName(spec), typeOnly });
  };
  for (const m of src.matchAll(/\b(?:import|export)\s+(type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g)) add(m[2]!, Boolean(m[1]));
  for (const m of src.matchAll(/\bimport\(\s*["']([^"'\n]+)["']\s*\)/g)) add(m[1]!, false);
  for (const m of src.matchAll(/\brequire\(\s*["']([^"'\n]+)["']\s*\)/g)) add(m[1]!, false);
  return uses;
}

describe("runtime imports are declared dependencies", () => {
  const uses = sourceFiles(path.join(ROOT, "src")).flatMap(importsOf);

  it("finds a meaningful number of imports (the scanner is not silently matching nothing)", () => {
    expect(uses.length).toBeGreaterThan(200);
    const names = new Set(uses.map((u) => u.pkg));
    for (const known of ["next", "react", "zod", "resend", "nodemailer", "ioredis"]) expect(names.has(known), `${known} import not found by the scanner`).toBe(true);
  });

  it("no runtime source file imports a package that is missing from `dependencies`", () => {
    const missing = uses.filter((u) => !RUNTIME.has(u.pkg) && !(u.typeOnly && DEV.has(u.pkg)));
    const detail = [...new Set(missing.map((u) => `${u.pkg}  (${u.file})`))].sort();
    expect(detail).toEqual([]);
  });

  it("the optional e-mail provider SDKs are real runtime dependencies", () => {
    expect(RUNTIME.has("nodemailer")).toBe(true);
    expect(RUNTIME.has("resend")).toBe(true);
    expect(DEV.has("@types/nodemailer")).toBe(false); // nodemailer ships its own types; the DefinitelyTyped package targets an older API
  });
});
