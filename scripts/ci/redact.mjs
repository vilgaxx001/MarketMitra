// stdin -> stdout filter. Removes things that must never reach a log or an uploaded artifact:
//   * the VALUE of every environment variable named in CI_REDACT_VARS (comma separated, e.g. "SESSION_SECRET")
//   * any postgres:// or postgresql:// URL (credentials, host and database name)
//   * Bearer tokens and obvious API-key shapes
import { createInterface } from "node:readline";

export function buildRedactor(env = process.env) {
  const secrets = (env.CI_REDACT_VARS ?? "").split(",").map((n) => n.trim()).filter(Boolean)
    .map((n) => env[n]).filter((v) => typeof v === "string" && v.length >= 6);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = secrets.length ? new RegExp(secrets.map(esc).join("|"), "g") : null;
  return (line) => {
    let out = line;
    if (exact) out = out.replace(exact, "<redacted>");
    out = out.replace(/postgres(?:ql)?:\/\/[^\s"'<>)]+/gi, "postgresql://<redacted>");
    out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer <redacted>");
    out = out.replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, "$1_$2_<redacted>");
    out = out.replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, "sk-<redacted>");
    return out;
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const redact = buildRedactor();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (l) => process.stdout.write(redact(l) + "\n"));
}
