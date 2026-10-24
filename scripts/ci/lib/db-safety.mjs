// Every destructive database operation in the CI scripts goes through assertDisposable(). It refuses anything that is not
// provably the throw-away CI database: loopback host, a database name starting "mm_ci_", and an explicit CI marker
// (GITHUB_ACTIONS=true, or MM_CI_LOCAL_DISPOSABLE=1 for a developer rehearsal on their own disposable server).
export const NAME_RE = /^mm_ci_[a-z0-9_]{1,40}$/;

export function assertDisposableName(name) {
  if (!NAME_RE.test(name)) throw new Error(`refusing: database name "${name}" does not match ${NAME_RE}`);
}

export function assertDisposable(urlString, env = process.env) {
  let u;
  try { u = new URL(urlString); } catch { throw new Error("refusing: not a valid database URL"); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("refusing: not a postgres URL");
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname)) throw new Error(`refusing: host "${u.hostname}" is not loopback`);
  assertDisposableName(decodeURIComponent(u.pathname.slice(1)));
  if (env.GITHUB_ACTIONS !== "true" && env.MM_CI_LOCAL_DISPOSABLE !== "1") {
    throw new Error("refusing: neither GITHUB_ACTIONS=true nor MM_CI_LOCAL_DISPOSABLE=1 is set");
  }
  if (env.MM_CI_PG_PORT && String(u.port || "5432") !== String(env.MM_CI_PG_PORT)) throw new Error("refusing: port does not match MM_CI_PG_PORT");
  return u;
}
