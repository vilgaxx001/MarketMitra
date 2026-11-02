// REAL-SERVICE HTTP verification (not a unit test, not run by vitest, no mocks).
//
// Drives a RUNNING MarketMitra server over HTTP against a real, migrated, DISPOSABLE PostgreSQL and a real Redis.
// It creates users/workspaces/businesses through the public API and writes ONLY these direct SQL rows:
//   * workspace_members rows for a TEAM_MEMBER and a CLIENT (team invites are delivered by email, which this environment cannot send)
//   * reads (never writes) audit_logs / business_* tables to confirm what the API persisted.
//
//   BASE_URL=http://127.0.0.1:3101 PGURL=postgresql://postgres@127.0.0.1:54329/mm_app REDIS_URL=redis://127.0.0.1:63799 \
//   SESSION_SECRET=<the SAME secret the server under test was started with> \
//     node scripts/http-verification/run.mjs [--out results.json]
//
// SESSION_SECRET is REQUIRED: the identity-header section signs an expired token and a wrong-secret token to prove the server
// rejects them even when forged x-user-id / x-session-id / x-user-email / x-platform-role headers accompany them.
//
// Never point PGURL/REDIS_URL at a database or Redis you care about.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(here, "../migration-verification/package.json")); // pg lives in the harness package, not the app
const pg = req("pg");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const PGURL = process.env.PGURL;
if (!PGURL) { console.error("PGURL is required"); process.exit(2); }
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) { console.error("SESSION_SECRET is required (same value as the server under test)"); process.exit(2); }
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "marketmitra_session";
const jose = createRequire(path.join(here, "../../package.json"))("jose");
const sql = new pg.Pool({ connectionString: PGURL, max: 2 });
let redis = null;
if (process.env.REDIS_URL) {
  const Redis = createRequire(path.join(here, "../../package.json"))("ioredis");
  redis = new Redis(process.env.REDIS_URL);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  <-- " + String(detail).slice(0, 300)}`);
}
const section = (t) => console.log(`\n== ${t}`);

// The app under test runs with TRUSTED_IP_HEADER=x-real-ip (scripts/ci/write-env.sh), i.e. this script plays the trusted edge.
// Every Client gets its OWN address, so the rate limits (src/lib/rate-limit) see each simulated user separately and the older
// sections never share a counter. Sections that test the limits override it per request.
let clientSeq = 0;
// Run-derived second octet: a re-run against the SAME Redis (limit windows last up to an hour) does not meet the previous run's counters.
const runOctet = 16 + (parseInt(Date.now().toString(36), 36) & 15);
class Client {
  constructor(label) { this.label = label; this.cookies = new Map(); const n = ++clientSeq; this.ip = `172.${runOctet}.${(n >> 8) & 255}.${n & 255}`; }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
  async call(method, p, body, { raw, headers, redirect } = {}) {
    const h = { Origin: BASE, "x-real-ip": this.ip, ...(headers ?? {}) };
    if (this.cookies.size) h.Cookie = this.header();
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) { h["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const init = { method, headers: h, body: payload, ...(redirect ? { redirect } : {}) };
    if (payload && typeof payload === "object" && "getReader" in payload) init.duplex = "half";
    const res = await fetch(BASE + p, init);
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = sc.split(";"); const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim(); const value = pair.slice(i + 1).trim();
      const expired = /max-age=0/i.test(attrs.join(";")) || /expires=Thu, 01 Jan 1970/i.test(attrs.join(";")) || value === "";
      if (expired) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
}
const code = (r) => r.json?.error?.code;
const PASSWORD = "Verify1234Pass";
const run = Date.now().toString(36);
const email = (l) => `http-verify-${l}-${run}@example.test`;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
// Signup is account-enumeration safe: the server answers 202 with NO session and creates the account AFTER the response. A real
// user then signs in; this helper does the same: POST signup, wait for the row to exist, log in once. `r` is the SIGNUP response,
// `signupCookies` how many cookies it set (must be 0), `login` the sign-in response.
async function signup(label) {
  const c = new Client(label);
  const r = await c.call("POST", "/api/v1/auth/signup", { name: `User ${label}`, email: email(label), password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true });
  const signupCookies = c.cookies.size;
  let exists = false;
  for (let i = 0; i < 120 && !exists; i++) { exists = (await sql.query(`select 1 from users where email=$1`, [email(label)])).rowCount > 0; if (!exists) await sleep(150); }
  const login = exists ? await c.call("POST", "/api/v1/auth/login", { email: email(label), password: PASSWORD }) : null;
  return { c, r, signupCookies, exists, login };
}

try {
  // ---------------------------------------------------------------- AUTH
  section("Authentication");
  const anon = new Client("anon");
  let r = await anon.call("GET", "/api/v1/auth/me");
  check("unauthenticated /auth/me -> 401 UNAUTHENTICATED", r.status === 401 && code(r) === "UNAUTHENTICATED", `${r.status} ${r.text}`);
  r = await anon.call("POST", "/api/v1/auth/signup", { name: "X", email: email("weak"), password: "short", confirmPassword: "short", acceptTerms: true });
  check("signup with weak password -> 400 VALIDATION_ERROR", r.status === 400 && code(r) === "VALIDATION_ERROR", `${r.status} ${r.text}`);
  r = await anon.call("POST", "/api/v1/auth/signup", { name: "X", email: email("terms"), password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: false });
  check("signup without accepting terms -> 400", r.status === 400, r.status);

  for (const pth of ["/", "/pricing", "/features", "/login", "/signup"]) {
    r = await anon.call("GET", pth, undefined, { redirect: "manual" });
    check(`public page ${pth} renders (200) for an anonymous visitor`, r.status === 200, `${r.status} ${r.headers.get("location") ?? ""}`);
  }

  const A = await signup("a"), B = await signup("b"), M = await signup("m"), C = await signup("c");
  check("signup (A) -> 202 'check your email' with NO session cookie and no user object in the response", A.r.status === 202 && A.signupCookies === 0 && !/"user"|"id"|emailVerified/.test(A.r.text), `${A.r.status} cookies=${A.signupCookies} ${A.r.text}`);
  check("the account is created after the response and the new user can sign in (200 + session cookie)", A.exists && A.login?.status === 200 && A.c.cookies.size > 0, `${A.login?.status} ${A.login?.text}`);
  check("signup response does not expose the password or its hash", !/passwordHash|Verify1234Pass/.test(A.r.text), A.r.text);
  const storedBefore = (await sql.query(`select id, "passwordHash" h from users where email=$1`, [email("a")])).rows[0];
  const dupClient = new Client("dup");
  const dup = await dupClient.call("POST", "/api/v1/auth/signup", { name: "Mallory", email: email("a"), password: "Other1234Pass", confirmPassword: "Other1234Pass", acceptTerms: true });
  check("ENUMERATION: signing up with an EXISTING address returns the same status, byte-identical body and no cookie as a new address", dup.status === A.r.status && dup.text === A.r.text && dupClient.cookies.size === 0 && !(dup.headers.getSetCookie?.() ?? []).length, `${dup.status} ${dup.text} | ${A.r.status} ${A.r.text}`);
  check("ENUMERATION: the two responses carry the same headers (apart from per-request ones)", ["content-type", "cache-control"].every((h) => dup.headers.get(h) === A.r.headers.get(h)), `${dup.headers.get("cache-control")} vs ${A.r.headers.get("cache-control")}`);
  await sleep(2_500); // the deferred work (hash + lookup + notice) has had time to run
  const afterDup = (await sql.query(`select id, "passwordHash" h, (select count(*) from users where email=$1) n from users where email=$1`, [email("a")])).rows[0];
  check("an existing account is untouched by a signup attempt: still ONE row, same id, same password hash (no takeover, no duplicate)", afterDup?.n === "1" && afterDup.id === storedBefore.id && afterDup.h === storedBefore.h, JSON.stringify({ n: afterDup?.n }));
  const wrongPw = await new Client("dup2").call("POST", "/api/v1/auth/login", { email: email("a"), password: "Other1234Pass" });
  check("the attacker's password does NOT work on the existing account", wrongPw.status === 401, `${wrongPw.status}`);
  const stored = storedBefore.h ?? "";
  check("password is stored hashed (not the plaintext)", stored.length > 20 && !stored.includes(PASSWORD), stored.slice(0, 7) + "…");

  r = await A.c.call("GET", "/api/v1/auth/me");
  check("/auth/me with session -> 200 and own email", r.status === 200 && JSON.stringify(r.json).includes(email("a")), `${r.status} ${r.text}`);
  const bad = new Client("bad"); bad.cookies = new Map([...A.c.cookies].map(([k, v]) => [k, v.slice(0, -4) + (v.endsWith("AAAA") ? "BBBB" : "AAAA")]));
  r = await bad.call("GET", "/api/v1/auth/me");
  check("tampered session cookie -> 401", r.status === 401, `${r.status} ${r.text}`);
  const l1 = new Client("login"); r = await l1.call("POST", "/api/v1/auth/login", { email: email("a"), password: "Wrong1234Pass" });
  check("login with wrong password -> 401, no cookie", r.status === 401 && l1.cookies.size === 0, `${r.status} ${r.text}`);
  r = await l1.call("POST", "/api/v1/auth/login", { email: email("nobody"), password: PASSWORD });
  check("login for unknown user -> same 401 (no account enumeration)", r.status === 401, `${r.status} ${r.text}`);
  r = await l1.call("POST", "/api/v1/auth/login", { email: email("a"), password: PASSWORD });
  check("login with correct password -> 200 and cookie", r.status === 200 && l1.cookies.size > 0, `${r.status} ${r.text}`);
  r = await l1.call("POST", "/api/v1/auth/logout");
  const afterLogout = await l1.call("GET", "/api/v1/auth/me");
  check("logout then /auth/me -> 401", r.status < 300 && afterLogout.status === 401, `${r.status} / ${afterLogout.status}`);
  const reuse = new Client("reuse"); // re-presenting the pre-logout token must not work (server-side session revocation)
  const l2 = new Client("l2"); await l2.call("POST", "/api/v1/auth/login", { email: email("a"), password: PASSWORD });
  const tokenCopy = new Map(l2.cookies); await l2.call("POST", "/api/v1/auth/logout"); reuse.cookies = tokenCopy;
  r = await reuse.call("GET", "/api/v1/auth/me");
  check("a copied session token is rejected after logout", r.status === 401, `${r.status} ${r.text}`);
  r = await reuse.call("POST", "/api/v1/auth/resend-verification");
  check("a copied session token is also refused by resend-verification after logout", r.status === 401, `${r.status} ${r.text}`);
  const follow = async (c, start) => { const hops = []; let u = start; for (let i = 0; i < 8; i++) { const x = await c.call("GET", u, undefined, { redirect: "manual" }); const loc = x.headers.get("location"); hops.push(`${u}:${x.status}`); if (!loc) return { hops, final: x.status }; const n = new URL(loc, BASE); u = n.pathname + n.search; } return { hops, final: "LOOP" }; };
  let chain = await follow(reuse, "/login");
  check("a revoked-but-unexpired session cookie can still reach /login and the redirect chain terminates (no /login <-> /dashboard loop)", chain.final === 200, chain.hops.join(" -> "));
  chain = await follow(reuse, "/dashboard");
  check("a revoked cookie on /dashboard ends at the login page (200), not in a redirect loop", chain.final === 200 && chain.hops.some((h) => h.startsWith("/login")), chain.hops.join(" -> "));
  chain = await follow(A.c, "/login");
  check("a LIVE session on /login is still redirected away to /dashboard (existing behaviour preserved)", chain.hops[0] === "/login:307" && chain.hops[1]?.startsWith("/dashboard"), chain.hops.join(" -> "));
  r = await A.c.call("GET", "/pricing", undefined, { redirect: "manual" });
  check("a signed-in visitor still sees the marketing pricing page (200)", r.status === 200, r.status);
  const PWU = await signup("pw"); const pw = PWU.c;
  const pwToken = new Map(pw.cookies); const pwUser = (await sql.query(`select id from users where email=$1`, [email("pw")])).rows[0].id;
  await sql.query(`delete from sessions where "userId"=$1`, [pwUser]); // what a password change / reset does server-side (repo.deleteAllUserSessions)
  const pwCopy = new Client("pwcopy"); pwCopy.cookies = pwToken; r = await pwCopy.call("GET", "/api/v1/auth/me");
  check("a token whose sessions were all deleted (password change/reset) is rejected", r.status === 401, `${r.status} ${r.text}`);

  // ---------------------------------------------------------------- WORKSPACES / BUSINESSES
  section("Workspaces and businesses");
  r = await A.c.call("POST", "/api/v1/workspaces", { name: `Alpha ${run}` }); const WA = r.json?.data;
  check("A creates workspace", r.status < 300 && WA?.slug, `${r.status} ${r.text}`);
  r = await B.c.call("POST", "/api/v1/workspaces", { name: `Beta ${run}` }); const WB = r.json?.data;
  check("B creates workspace", r.status < 300 && WB?.slug, `${r.status} ${r.text}`);
  r = await A.c.call("GET", "/api/v1/workspaces");
  const listed = JSON.stringify(r.json?.data ?? []);
  check("A's workspace list contains Alpha and not Beta", listed.includes(WA.slug) && !listed.includes(WB.slug), listed.slice(0, 200));
  r = await A.c.call("POST", `/api/v1/workspaces/${WA.slug}/businesses`, { businessName: "Alpha Bakery" }); const BA = r.json?.data;
  check("A creates business in Alpha", r.status < 300 && BA?.id, `${r.status} ${r.text}`);
  r = await B.c.call("POST", `/api/v1/workspaces/${WB.slug}/businesses`, { businessName: "Beta Bikes" }); const BB = r.json?.data;
  check("B creates business in Beta", r.status < 300 && BB?.id, `${r.status} ${r.text}`);

  // direct SQL membership for the two lower roles (invites are emailed; email cannot be sent here)
  const ws = (await sql.query(`select id from workspaces where slug=$1`, [WA.slug])).rows[0].id;
  for (const [lbl, role] of [["m", "TEAM_MEMBER"], ["c", "CLIENT"]]) {
    const uid = (await sql.query(`select id from users where email=$1`, [email(lbl)])).rows[0].id;
    await sql.query(`insert into workspace_members(id,"workspaceId","userId",role) values ($1,$2,$3,$4::"WorkspaceRole")`, [`cm${lbl}${run}`.padEnd(25, "0").slice(0, 25), ws, uid, role]);
  }
  const p = (w, b) => `/api/v1/workspaces/${w}/businesses/${b}`;
  const PA = `${p(WA.slug, BA.id)}/ai-preferences`, MA = `${p(WA.slug, BA.id)}/ai-memories`;

  // ---------------------------------------------------------------- RBAC
  section("RBAC (ADMIN / TEAM_MEMBER / CLIENT)");
  const memBody = { type: "BUSINESS_FACT", content: "Opens at 7am on weekdays." };
  const probe = async (who, c) => ({
    bizList: (await c.call("GET", `/api/v1/workspaces/${WA.slug}/businesses`)).status,
    bizCreate: (await c.call("POST", `/api/v1/workspaces/${WA.slug}/businesses`, { businessName: `X ${who}` })).status,
    prefRead: (await c.call("GET", PA)).status,
    prefEdit: (await c.call("PATCH", PA, { detailLevel: "CONCISE" })).status,
    memRead: (await c.call("GET", MA)).status,
    memCreate: (await c.call("POST", MA, memBody)).status,
  });
  const adm = await probe("admin", A.c), tm = await probe("member", M.c), cl = await probe("client", C.c);
  console.log("   matrix", JSON.stringify({ ADMIN: adm, TEAM_MEMBER: tm, CLIENT: cl }));
  // ADMIN's business create is 402 here by design: the free plan allows one business and Alpha already has one (plan limit, checked AFTER the permission).
  check("ADMIN: everything allowed (business create answers 402 plan-limit because Alpha already has its one free-plan business)", adm.bizList < 300 && adm.prefRead < 300 && adm.prefEdit < 300 && adm.memRead < 300 && adm.memCreate < 300 && adm.bizCreate === 402, JSON.stringify(adm));
  check("TEAM_MEMBER: read business/preferences/memory allowed; create business, edit preferences, create memory -> 403",
    tm.bizList < 300 && tm.prefRead < 300 && tm.memRead < 300 && tm.bizCreate === 403 && tm.prefEdit === 403 && tm.memCreate === 403, JSON.stringify(tm));
  check("CLIENT: only business read allowed; preferences/memory read+write and business create -> 403",
    cl.bizList < 300 && cl.bizCreate === 403 && cl.prefRead === 403 && cl.prefEdit === 403 && cl.memRead === 403 && cl.memCreate === 403, JSON.stringify(cl));
  const exec = (c, w = WA.slug, extra = {}) => c.call("POST", `/api/v1/workspaces/${w}/ai/execute`, { messages: [{ role: "USER", text: "Write one line about bread." }], maxOutputTokens: 64, ...extra });
  r = await exec(C.c); check("CLIENT cannot execute AI (ai:execute) -> 403", r.status === 403, `${r.status} ${r.text}`);

  // ---------------------------------------------------------------- ISOLATION
  section("Workspace / business isolation");
  const paths = [["GET", PA], ["GET", MA], ["GET", `${p(WA.slug, BA.id)}`], ["GET", `/api/v1/workspaces/${WA.slug}/businesses`]];
  for (const [m, pa] of paths) { r = await B.c.call(m, pa); check(`B (other tenant) ${m} ${pa.replace(/c[a-z0-9]{24}/g, ":id")} using Alpha's slug -> 403/404`, [403, 404].includes(r.status), `${r.status} ${r.text}`); }
  r = await B.c.call("GET", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-preferences`);
  check("B with OWN slug but Alpha's businessId (preferences) -> 404, not Alpha's data", r.status === 404 && !r.text.includes("Alpha"), `${r.status} ${r.text}`);
  r = await B.c.call("GET", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-memories`);
  check("B with OWN slug but Alpha's businessId (memories list) -> 404", r.status === 404, `${r.status} ${r.text}`);
  r = await B.c.call("PATCH", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-preferences`, { detailLevel: "DETAILED" });
  check("B cannot WRITE Alpha's preferences through its own slug -> 404", r.status === 404, `${r.status} ${r.text}`);
  r = await B.c.call("POST", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-memories`, memBody);
  check("B cannot CREATE a memory on Alpha's business through its own slug -> 404", r.status === 404, `${r.status} ${r.text}`);
  const leak = (await sql.query(`select count(*)::int n from business_memories where "businessId"=$1`, [BA.id])).rows[0].n;
  check("no memory row was created on Alpha's business by B", leak <= 1 /* only A's own admin probe above */, `rows=${leak}`);


  // ---------------------------------------------------------------- IDENTITY HEADERS
  section("Identity-header trust: client-forged x-user-id / x-session-id / x-user-email / x-platform-role must never become identity");
  const claimsOf = (tok) => JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
  const tokB = B.c.cookies.get(COOKIE_NAME); const claimsB = claimsOf(tokB);
  const uid = async (e) => (await sql.query(`select id from users where email=$1`, [e])).rows[0].id;
  const uidA = await uid(email("a")), uidB = await uid(email("b"));
  const forgedHeaders = (o = {}) => ({ "x-user-id": claimsB.userId, "x-session-id": claimsB.sessionId, "x-user-email": claimsB.email, "x-platform-role": "SUPER_ADMIN", ...o });
  const victimOps = [
    ["GET /businesses", "GET", `/api/v1/workspaces/${WA.slug}/businesses`],
    ["GET ai-preferences", "GET", PA], ["GET ai-memories", "GET", MA],
    ["PATCH ai-preferences", "PATCH", PA, { businessInstructions: "FORGED-WRITE" }],
    ["POST ai-memories", "POST", MA, { type: "BUSINESS_FACT", content: "FORGED-MEMORY" }],
    ["POST ai/execute", "POST", `/api/v1/workspaces/${WA.slug}/ai/execute`, { messages: [{ role: "USER", text: "x" }], maxOutputTokens: 64 }],
    ["GET /auth/me", "GET", "/api/v1/auth/me"],
  ];
  const sweep = async (c, headers) => { const out = {}; for (const [n, m, u, b] of victimOps) out[n] = (await c.call(m, u, b, { headers })).status; return out; };
  const all = (o, ...ok) => Object.values(o).every((s) => ok.includes(s));
  const withCookie = (label, token) => { const c = new Client(label); if (token) c.cookies.set(COOKIE_NAME, token); return c; };

  let st = await sweep(withCookie("nocookie-fabricated"), { "x-user-id": "fabricated-user", "x-session-id": "fabricated-session", "x-user-email": "root@evil.test", "x-platform-role": "SUPER_ADMIN" });
  console.log("   no cookie, fabricated identity + SUPER_ADMIN:", JSON.stringify(st));
  check("NO cookie + fabricated four identity headers (SUPER_ADMIN) -> 401 on every route", all(st, 401), JSON.stringify(st));
  st = await sweep(withCookie("nocookie-victim"), { "x-user-id": uidA, "x-session-id": "fabricated-session", "x-user-email": email("a"), "x-platform-role": "SUPER_ADMIN" });
  check("NO cookie + the VICTIM's real userId/email + forged SUPER_ADMIN -> 401 on every route", all(st, 401), JSON.stringify(st));
  st = await sweep(withCookie("nocookie-own-session"), forgedHeaders());
  console.log("   no cookie, attacker's OWN sessionId/userId + forged SUPER_ADMIN:", JSON.stringify(st));
  check("NO cookie + the attacker's OWN valid sessionId/userId (copied from their JWT) + forged SUPER_ADMIN -> 401 on every route", all(st, 401), JSON.stringify(st));

  const secretKey = new TextEncoder().encode(SESSION_SECRET);
  const { userId: cu, sessionId: cs, email: ce, platformRole: cr } = claimsB; const claims = { userId: cu, sessionId: cs, email: ce, platformRole: cr };
  const sign = (key, exp) => new jose.SignJWT({ ...claims }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(exp).setIssuer("marketmitra").setAudience("marketmitra-app").sign(key);
  const badCookies = {
    "garbage (not a JWT)": "not-a-jwt",
    "tampered signature": tokB.slice(0, -6) + (tokB.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA"),
    "payload swapped to SUPER_ADMIN, original signature kept": (() => { const [h, , sg] = tokB.split("."); return `${h}.${Buffer.from(JSON.stringify({ ...claimsB, platformRole: "SUPER_ADMIN" })).toString("base64url")}.${sg}`; })(),
    "EXPIRED (correctly signed, exp in the past)": await sign(secretKey, Math.floor(Date.now() / 1000) - 3600),
    "signed with the WRONG secret": await sign(new TextEncoder().encode(SESSION_SECRET + "-wrong"), "1h"),
    "alg=none (unsigned)": new jose.UnsecuredJWT({ ...claims, platformRole: "SUPER_ADMIN" }).setIssuedAt().setExpirationTime("1h").setIssuer("marketmitra").setAudience("marketmitra-app").encode(),
  };
  for (const [name, token] of Object.entries(badCookies)) {
    st = await sweep(withCookie("bad", token), forgedHeaders());
    check(`${name} cookie + attacker's own ids + forged SUPER_ADMIN -> 401 on every route`, all(st, 401), JSON.stringify(st));
  }

  st = await sweep(B.c, forgedHeaders());
  console.log("   attacker's valid cookie + forged SUPER_ADMIN:", JSON.stringify(st));
  check("valid cookie (tenant B) + forged SUPER_ADMIN -> still 403 on Alpha's workspace routes (role is not taken from the header)", victimOps.slice(0, 6).every(([n]) => st[n] === 403) && st["GET /auth/me"] === 200, JSON.stringify(st));
  r = await B.c.call("GET", "/api/v1/auth/me", undefined, { headers: forgedHeaders({ "x-user-id": uidA, "x-user-email": email("a") }) });
  check("valid cookie (B) + forged x-user-id/x-user-email of victim A -> /auth/me still reports B (headers are ignored), never A", r.status === 200 && r.text.includes(email("b")) && !r.text.includes(email("a")) && !/SUPER_ADMIN/.test(r.text), `${r.status} ${r.text}`);
  st = await sweep(B.c, forgedHeaders({ "x-user-id": uidA, "x-user-email": email("a") }));
  check("valid cookie (B) + forged victim userId + SUPER_ADMIN -> Alpha's routes 403 (never A's identity)", victimOps.slice(0, 6).every(([n]) => st[n] === 403), JSON.stringify(st));
  r = await B.c.call("GET", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-preferences`, undefined, { headers: forgedHeaders() });
  check("valid cookie (B) + forged SUPER_ADMIN, own slug + Alpha's businessId -> 404 (cross-business, no data)", r.status === 404 && !r.text.includes("Alpha"), `${r.status} ${r.text}`);
  const forgedWrites = (await sql.query(`select (select count(*)::int from business_ai_preferences where "businessId"=$1 and "businessInstructions"='FORGED-WRITE') p, (select count(*)::int from business_memories where "businessId"=$1 and content='FORGED-MEMORY') m`, [BA.id])).rows[0]; // scoped to THIS run's Alpha business (the disposable DB keeps rows from earlier runs)
  check("none of the forged writes reached the database (no FORGED-WRITE preference, no FORGED-MEMORY row)", forgedWrites.p === 0 && forgedWrites.m === 0, JSON.stringify(forgedWrites));

  // page routes (middleware redirects + server-component guards), redirects not followed
  const manual = { redirect: "manual" };
  r = await withCookie("page-anon").call("GET", `/${WA.slug}/dashboard`, undefined, { ...manual, headers: forgedHeaders() });
  check("NO cookie + forged SUPER_ADMIN headers: Alpha's dashboard page redirects to /login (not rendered)", [307, 308].includes(r.status) && /\/login/.test(r.headers.get("location") ?? ""), `${r.status} ${r.headers.get("location")}`);
  r = await B.c.call("GET", `/${WA.slug}/dashboard`, undefined, { ...manual, headers: forgedHeaders() });
  check("valid cookie (B) + forged SUPER_ADMIN: Alpha's dashboard page does NOT render (redirect away)", [307, 308].includes(r.status) && !/\/login/.test(r.headers.get("location") ?? "") && !r.text.includes("Alpha"), `${r.status} ${r.headers.get("location")}`);
  r = await B.c.call("GET", `/${WB.slug}/dashboard`, undefined, { ...manual, headers: forgedHeaders() });
  check("valid cookie (B): B's OWN dashboard page still renders (200) — legitimate flow preserved", r.status === 200, `${r.status} ${r.headers.get("location")}`);

  // role / state authority = the database, not the token
  const mkUser = async (label) => { const u = await signup(label); return { ...u, id: await uid(email(label)) }; };
  const login = async (label) => { const c = new Client(label + "-login"); const x = await c.call("POST", "/api/v1/auth/login", { email: email(label), password: PASSWORD }); if (x.status !== 200) throw new Error(`login ${label}: ${x.status} ${x.text}`); return c; };
  const SA = await mkUser("sa"); await sql.query(`update users set "platformRole"='SUPER_ADMIN' where id=$1`, [SA.id]);
  const saC = await login("sa");
  r = await saC.call("GET", "/api/v1/auth/me"); check("legitimate SUPER_ADMIN (promoted in DB, then logged in): /auth/me reports SUPER_ADMIN", r.status === 200 && /SUPER_ADMIN/.test(r.text), `${r.status} ${r.text}`);
  const saA = await saC.call("GET", `/api/v1/workspaces/${WA.slug}/businesses`), saB = await saC.call("GET", `/api/v1/workspaces/${WB.slug}/businesses`), saX = await saC.call("GET", `/api/v1/workspaces/no-such-ws-${run}/businesses`);
  check("legitimate SUPER_ADMIN keeps cross-workspace access (Alpha 200, Beta 200) and unknown workspaces are 404", saA.status === 200 && saB.status === 200 && saX.status === 404, `${saA.status}/${saB.status}/${saX.status}`);

  // SUPER_ADMIN actions must be attributed to the SUPER_ADMIN, never to the workspace owner
  const WAowner = (await sql.query(`select "ownerId" o from workspaces where id=$1`, [ws])).rows[0].o;
  r = await saC.call("POST", MA, { type: "BUSINESS_FACT", content: "SA attribution probe" }); const saMem = r.json?.data;
  const saRows = saMem?.id ? (await sql.query(`select (select "createdById" from business_memories where id=$1) c, (select "actorId" from audit_logs where "targetId"=$1 and action='ai_memory.created' limit 1) a`, [saMem.id])).rows[0] : {};
  check("SUPER_ADMIN creates a memory in another tenant's business: createdById and the audit actor are the SUPER_ADMIN, NOT the workspace owner", r.status === 201 && saRows.c === SA.id && saRows.a === SA.id && saRows.c !== WAowner, `${r.status} createdBy=${saRows.c} audit.actor=${saRows.a} sa=${SA.id} owner=${WAowner}`);
  const O = await mkUser("owner2"), O2 = await mkUser("admin2");
  r = await O.c.call("POST", "/api/v1/workspaces", { name: `TwoAdmins ${run}` }); const WO = r.json?.data;
  const wsO = (await sql.query(`select id from workspaces where slug=$1`, [WO.slug])).rows[0].id;
  await sql.query(`insert into workspace_members(id,"workspaceId","userId",role) values ($1,$2,$3,'ADMIN'::"WorkspaceRole")`, [`cmo2${run}`.padEnd(25, "0").slice(0, 25), wsO, O2.id]);
  r = await saC.call("POST", `/api/v1/workspaces/${WO.slug}/leave`);
  const ownerStill = (await sql.query(`select count(*)::int n from workspace_members where "workspaceId"=$1 and "userId"=(select "ownerId" from workspaces where id=$1)`, [wsO])).rows[0].n;
  check("SUPER_ADMIN calling /leave on a workspace they are not a member of -> 404, and the workspace OWNER is not removed", r.status === 404 && ownerStill === 1, `${r.status} ${r.text.slice(0, 120)} ownerMemberRows=${ownerStill}`);

  const D = await mkUser("demoted"); await sql.query(`update users set "platformRole"='SUPER_ADMIN' where id=$1`, [D.id]);
  const dC = await login("demoted"); const dClaims = claimsOf(dC.cookies.get(COOKIE_NAME));
  await sql.query(`update users set "platformRole"='USER' where id=$1`, [D.id]);
  st = await sweep(dC, undefined);
  check("token issued while SUPER_ADMIN (JWT still says SUPER_ADMIN) but DB-demoted to USER -> Alpha's routes 403 (role comes from the DB)", dClaims.platformRole === "SUPER_ADMIN" && victimOps.slice(0, 6).every(([n]) => st[n] === 403), `${dClaims.platformRole} ${JSON.stringify(st)}`);
  r = await dC.call("GET", "/api/v1/auth/me"); check("demoted user's /auth/me reports USER, not the stale JWT role", r.status === 200 && !/SUPER_ADMIN/.test(r.text), `${r.status} ${r.text}`);

  const P = await mkUser("promoted"); await sql.query(`update users set "platformRole"='SUPER_ADMIN' where id=$1`, [P.id]);
  r = await P.c.call("GET", `/api/v1/workspaces/${WA.slug}/businesses`);
  check("a user promoted in the DB AFTER login (JWT says USER) gets SUPER_ADMIN access immediately (DB is the authority, both directions)", r.status === 200, `${r.status} ${r.text.slice(0, 120)}`);

  const I = await mkUser("inactive"); r = await I.c.call("POST", "/api/v1/workspaces", { name: `Inactive ${run}` }); const WI = r.json?.data;
  r = await I.c.call("GET", `/api/v1/workspaces/${WI.slug}/businesses`); const beforeDeact = r.status;
  await sql.query(`update users set "isActive"=false where id=$1`, [I.id]);
  const afterDeact = await I.c.call("GET", `/api/v1/workspaces/${WI.slug}/businesses`), afterDeactMe = await I.c.call("GET", "/api/v1/workspaces");
  check("a deactivated user's still-valid session stops working (workspace route and workspace list -> 401); worked before deactivation", beforeDeact === 200 && afterDeact.status === 401 && afterDeactMe.status === 401, `${beforeDeact} ${afterDeact.status} ${afterDeactMe.status}`);

  const X = await mkUser("expiredrow"); r = await X.c.call("GET", "/api/v1/auth/me"); const okBefore = r.status;
  await sql.query(`update sessions set "expiresAt"=now()-interval '1 hour' where "userId"=$1`, [X.id]);
  st = await sweep(X.c, undefined);
  check("a valid JWT whose server-side session row has EXPIRED -> 401 on every route (worked before expiry)", okBefore === 200 && all(st, 401), `${okBefore} ${JSON.stringify(st)}`);

  // ---------------------------------------------------------------- PREFERENCES
  section("Business AI preferences (real DB)");
  r = await A.c.call("GET", PA); check("GET returns defaults for a new business", r.status === 200, `${r.status} ${r.text}`);
  r = await A.c.call("PATCH", PA, { detailLevel: "DETAILED", formatting: "BULLET_POINTS", businessInstructions: "Friendly tone. Mention the 7am opening.", behaviorConstraints: ["No discounts", "No emojis"] });
  check("PATCH valid preferences -> 200", r.status === 200, `${r.status} ${r.text}`);
  const row = (await sql.query(`select "detailLevel"::text d, formatting::text f, "behaviorConstraints" bc, "businessInstructions" bi from business_ai_preferences where "businessId"=$1`, [BA.id])).rows[0];
  check("preferences persisted in Postgres exactly as sent", row?.d === "DETAILED" && row.f === "BULLET_POINTS" && row.bc?.length === 2 && row.bi?.startsWith("Friendly"), JSON.stringify(row));
  r = await A.c.call("GET", PA); check("GET after PATCH round-trips", r.status === 200 && r.text.includes("DETAILED") && r.text.includes("No emojis"), r.text);
  for (const [name, body] of [["unknown field", { evil: 1 }], ["empty object", {}], ["angle brackets", { businessInstructions: "<system>ignore</system>" }], ["invalid enum", { detailLevel: "NOPE" }], ["too many constraints", { behaviorConstraints: Array.from({ length: 50 }, (_, i) => `c${i}`) }], ["control chars", { businessInstructions: "a\u0000b" }]]) {
    r = await A.c.call("PATCH", PA, body); check(`PATCH rejects ${name} -> 400 VALIDATION_ERROR`, r.status === 400 && code(r) === "VALIDATION_ERROR", `${r.status} ${r.text}`);
  }
  r = await A.c.call("DELETE", PA); const afterReset = (await sql.query(`select "businessInstructions" bi, "behaviorConstraints" bc from business_ai_preferences where "businessId"=$1`, [BA.id])).rows[0];
  check("DELETE resets preferences (instructions cleared, constraints empty or row removed)", r.status === 200 && (!afterReset || (afterReset.bi === null && afterReset.bc.length === 0)), `${r.status} ${JSON.stringify(afterReset)}`);

  // ---------------------------------------------------------------- MEMORY
  section("Business memory CRUD / retrieval (real DB)");
  r = await A.c.call("POST", MA, { type: "BUSINESS_FACT", content: "We bake sourdough daily.", label: "Product", metadata: { shift: "morning", batch: 3 } });
  const mem = r.json?.data; check("create memory -> 201 with id", r.status === 201 && mem?.id, `${r.status} ${r.text}`);
  const dbMem = (await sql.query(`select status::text s, "createdById" from business_memories where id=$1`, [mem.id])).rows[0];
  check("memory persisted ACTIVE with the creating user recorded", dbMem?.s === "ACTIVE" && !!dbMem.createdById, JSON.stringify(dbMem));
  r = await A.c.call("GET", MA); check("list returns the memory with totalCount meta", r.status === 200 && r.text.includes(mem.id) && r.json?.meta?.totalCount >= 1, `${r.status} ${r.text.slice(0, 200)}`);
  r = await A.c.call("GET", `${MA}/${mem.id}`); check("get one memory -> 200", r.status === 200 && r.text.includes("sourdough"), `${r.status} ${r.text}`);
  r = await A.c.call("PATCH", `${MA}/${mem.id}`, { content: "We bake sourdough and rye daily." }); check("update memory -> 200", r.status === 200 && r.text.includes("rye"), `${r.status} ${r.text}`);
  r = await M.c.call("PATCH", `${MA}/${mem.id}`, { content: "member edit" }); check("TEAM_MEMBER cannot edit a memory -> 403", r.status === 403, `${r.status} ${r.text}`);
  r = await B.c.call("PATCH", `/api/v1/workspaces/${WB.slug}/businesses/${BB.id}/ai-memories/${mem.id}`, { content: "cross-tenant edit" });
  check("B cannot edit Alpha's memory id via B's own business -> 404", r.status === 404, `${r.status} ${r.text}`);
  r = await B.c.call("PATCH", `/api/v1/workspaces/${WB.slug}/businesses/${BA.id}/ai-memories/${mem.id}`, { content: "cross-tenant edit" });
  check("B cannot edit Alpha's memory id via Alpha's business id on B's slug -> 404", r.status === 404, `${r.status} ${r.text}`);
  const still = (await sql.query(`select content from business_memories where id=$1`, [mem.id])).rows[0].content;
  check("memory content unchanged after the cross-tenant attempts", still === "We bake sourdough and rye daily.", still);
  r = await A.c.call("POST", `${MA}/${mem.id}/archive`); check("archive memory -> 200", r.status === 200, `${r.status} ${r.text}`);
  r = await A.c.call("GET", MA); check("archived memory is hidden from the default list", r.status === 200 && !r.text.includes(mem.id), r.text.slice(0, 200));
  r = await A.c.call("POST", `${MA}/${mem.id}/restore`); check("restore memory -> 200 and ACTIVE again", r.status === 200 && (await sql.query(`select status::text s from business_memories where id=$1`, [mem.id])).rows[0].s === "ACTIVE", `${r.status} ${r.text}`);
  for (const [name, body] of [["secret-shaped content (API key)", { type: "BUSINESS_FACT", content: "key is sk-abcdefghijklmnopqrstuvwxyz0123456789" }], ["payment-card number", { type: "BUSINESS_FACT", content: "card 4242 4242 4242 4242" }], ["unknown/server-controlled field businessId", { type: "BUSINESS_FACT", content: "x", businessId: BB.id }], ["unknown field status", { type: "BUSINESS_FACT", content: "x", status: "ARCHIVED" }], ["angle brackets", { type: "BUSINESS_FACT", content: "<b>x</b>" }], ["secret-named metadata key", { type: "BUSINESS_FACT", content: "x", metadata: { apiKey: "v" } }], ["past expiresAt", { type: "BUSINESS_FACT", content: "x", expiresAt: "2001-01-01T00:00:00Z" }], ["invalid type", { type: "NOPE", content: "x" }]]) {
    r = await A.c.call("POST", MA, body); check(`create rejects ${name} -> 400`, r.status === 400 && code(r) === "VALIDATION_ERROR", `${r.status} ${r.text}`);
  }
  const audits = (await sql.query(`select action, metadata::text m from audit_logs where "workspaceId"=$1 order by "createdAt"`, [ws])).rows;
  check("audit log rows were written for the writes above", audits.length >= 4, `rows=${audits.length} actions=${[...new Set(audits.map((a) => a.action))].join(",")}`);
  check("audit metadata contains no plaintext password / session token / memory content", !audits.some((a) => /Verify1234Pass|sourdough/.test(a.m ?? "")), "");

  // ---------------------------------------------------------------- MALFORMED / OVERSIZED
  section("Malformed and oversized requests");
  const rawJson = { headers: { "Content-Type": "application/json" } };
  for (const [label, url] of [["preferences", PA], ["memory create", MA]]) {
    const m = label === "preferences" ? "PATCH" : "POST";
    r = await A.c.call(m, url, undefined, { raw: "{not json", ...rawJson }); check(`${label}: malformed JSON -> 400 (no 500, no parser text echoed)`, r.status === 400 && !/Unexpected|position|token/i.test(r.text), `${r.status} ${r.text}`);
    r = await A.c.call(m, url, undefined, { raw: "", ...rawJson }); check(`${label}: empty body -> 400`, r.status === 400, `${r.status} ${r.text}`);
    r = await A.c.call(m, url, undefined, { raw: new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]), ...rawJson }); check(`${label}: invalid UTF-8 -> 400`, r.status === 400, `${r.status} ${r.text}`);
    r = await A.c.call(m, url, undefined, { raw: "x".repeat(300_000), ...rawJson }); check(`${label}: 300 KB body -> 400 (too large)`, r.status === 400 && /large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    const big = new TextEncoder().encode(JSON.stringify({ businessInstructions: "a".repeat(200_000) }));
    const stream = new ReadableStream({ start(ctrl) { for (let i = 0; i < big.length; i += 16_384) ctrl.enqueue(big.slice(i, i + 16_384)); ctrl.close(); } });
    r = await A.c.call(m, url, undefined, { raw: stream, ...rawJson }); check(`${label}: oversized CHUNKED body with no Content-Length -> 400`, r.status === 400, `${r.status} ${r.text.slice(0, 120)}`);
    r = await A.c.call(m, url, undefined, { raw: JSON.stringify([1, 2]), ...rawJson }); check(`${label}: JSON array instead of object -> 400`, r.status === 400, `${r.status} ${r.text.slice(0, 120)}`);
  }
  const EX = `/api/v1/workspaces/${WA.slug}/ai/execute`;
  r = await A.c.call("POST", EX, undefined, { raw: "{bad", ...rawJson }); check("execute: malformed JSON -> 400", r.status === 400, `${r.status} ${r.text}`);
  r = await A.c.call("POST", EX, undefined, { raw: JSON.stringify({ messages: [{ role: "USER", text: "x".repeat(1_300_000) }] }), ...rawJson }); check("execute: 1.3 MB body -> 400 (too large)", r.status === 400 && /large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
  r = await exec(A.c, WA.slug, { messages: Array.from({ length: 21 }, () => ({ role: "USER", text: "hi" })) }); check("execute: 21 messages -> 400", r.status === 400, `${r.status} ${r.text.slice(0, 120)}`);
  r = await exec(A.c, WA.slug, { messages: [{ role: "USER", text: "x".repeat(8_001) }] }); check("execute: 8,001-char message -> 400", r.status === 400, `${r.status}`);
  r = await exec(A.c, WA.slug, { maxOutputTokens: 100000 }); check("execute: maxOutputTokens above limit -> 400", r.status === 400, `${r.status}`);
  r = await exec(A.c, WA.slug, { requiresBusinessContext: true }); check("execute: requiresBusinessContext without businessId -> 400", r.status === 400, `${r.status} ${r.text.slice(0, 160)}`);
  for (const pth of ["/api/v1/auth/login", "/api/v1/auth/signup", "/api/v1/auth/forgot-password", "/api/v1/contact", "/api/v1/ai/demo-generate"]) {
    r = await anon.call("POST", pth, undefined, { raw: "{bad", ...rawJson });
    check(`public ${pth}: malformed JSON -> 400 VALIDATION_ERROR (was 500), no parser text echoed`, r.status === 400 && code(r) === "VALIDATION_ERROR" && !/Unexpected|position|token/i.test(r.text), `${r.status} ${r.text}`);
  }
  r = await A.c.call("POST", "/api/v1/workspaces", undefined, { raw: "{bad", ...rawJson });
  check("legacy authenticated route POST /workspaces: malformed JSON -> 400 (was 500)", r.status === 400 && code(r) === "VALIDATION_ERROR", `${r.status} ${r.text}`);
  const health = await anon.call("GET", "/api/v1/auth/me"); check("server still healthy after the abusive requests", health.status === 401, health.status);

  // ---------------------------------------------------------------- AI EXECUTION (provider unreachable / unauthorised in this environment)
  section("AI execution and provider-error handling (real provider call attempted; no authorised credential)");
  const t0 = Date.now(); r = await exec(A.c);
  console.log(`   execute -> ${r.status} in ${Date.now() - t0} ms: ${r.text.slice(0, 220)}`);
  check("valid execute returns a SAFE provider error envelope (502 PROVIDER_ERROR), not 500 and not a stack trace", r.status === 502 && code(r) === "PROVIDER_ERROR" && !/at \w+ \(|node_modules|stack/i.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
  check("the provider key is never present in the response", !/sk-test|not-a-real-key|Bearer/i.test(r.text), "");
  r = await exec(A.c, WA.slug, { requiresBusinessContext: true, businessId: BB.id });
  check("execute with ANOTHER tenant's businessId -> 404 NOT_FOUND (not a provider error, no tenant data in the body)", r.status === 404 && code(r) === "NOT_FOUND" && !r.text.includes("Beta"), `${r.status} ${r.text.slice(0, 200)}`);
  r = await exec(M.c); check("TEAM_MEMBER may call execute (permission passes; provider error is expected)", r.status === 502, `${r.status} ${r.text.slice(0, 160)}`);

  if (redis) {
    section("Rate limiting through the real HTTP path (real Redis)");
    const key = `rl:v1:ai:ws:${ws}`; const ttl = await redis.pttl(key), cnt = await redis.zcard(key), kind = await redis.type(key);
    check("the AI counter exists in Redis as a sliding-window log (zset) with a bounded TTL after the execute calls", kind === "zset" && cnt >= 1 && ttl > 0 && ttl <= 60_000, `type=${kind} entries=${cnt} pttl=${ttl}`);
    await redis.del(key);
    const statuses = []; for (let i = 0; i < 24; i++) statuses.push((await exec(A.c)).status);
    const limited = statuses.filter((s) => s === 429).length, passed = statuses.filter((s) => s === 502).length;
    console.log(`   24 sequential calls: ${passed}x502 ${limited}x429 other=${statuses.filter((s) => s !== 502 && s !== 429).join(",")}`);
    check("exactly 20 calls pass the limiter per window, the rest -> 429 RATE_LIMITED", passed === 20 && limited === 4, JSON.stringify(statuses));
    r = await exec(A.c); check("429 body is the standard envelope with an integer Retry-After inside the 60 s window", r.status === 429 && code(r) === "RATE_LIMITED" && Number.isInteger(Number(r.headers.get("retry-after"))) && Number(r.headers.get("retry-after")) >= 1 && Number(r.headers.get("retry-after")) <= 60, `${r.status} retry-after=${r.headers.get("retry-after")} ${r.text}`);
    r = await exec(B.c, WB.slug); check("another workspace is not limited by Alpha's window", r.status === 502, `${r.status} ${r.text.slice(0, 120)}`);
  }

  section("Public-endpoint rate limits, body bounds and forgot-password deferral (real server, real Redis, real PostgreSQL)");
  {
    // Addresses derive from the run id so a re-run against the SAME Redis (windows last up to an hour) never meets stale counters.
    const net = parseInt(run, 36) % 65_000;
    const ipN = (n) => `10.${(net >> 8) & 255}.${net & 255}.${n}`;
    const at = (ip, extra = {}) => ({ headers: { "x-real-ip": ip, ...extra } });
    const LOGIN = "/api/v1/auth/login";
    const fresh = () => new Client("rl");
    const hasSession = (res) => (res.headers.getSetCookie?.() ?? []).some((c) => c.startsWith(`${COOKIE_NAME}=`));

    // --- per-IP limit: decided before validation, immune to a forged x-forwarded-for
    const st = [];
    for (let i = 0; i < 61; i++) st.push((await fresh().call("POST", LOGIN, {}, at(ipN(11), { "x-forwarded-for": `9.9.9.${i}` }))).status);
    check("login per-IP limit (failed attempts): requests 1-60 pass the limiter ({} -> 400), the 61st -> 429, although each request forged a different x-forwarded-for", st.slice(0, 60).every((x) => x === 400) && st[60] === 429, st.join(","));
    r = await fresh().call("POST", LOGIN, {}, at(ipN(11)));
    const retry = Number(r.headers.get("retry-after"));
    check("429 contract: RATE_LIMITED envelope, integer Retry-After within the 15-minute window, Cache-Control no-store, nothing about accounts", r.status === 429 && code(r) === "RATE_LIMITED" && Number.isInteger(retry) && retry >= 1 && retry <= 900 && /no-store/.test(r.headers.get("cache-control") ?? "") && !/account|password|e-?mail/i.test(r.json?.error?.message ?? ""), `${r.status} retry-after=${r.headers.get("retry-after")} ${r.text}`);
    r = await fresh().call("POST", LOGIN, {}, at(ipN(12)));
    check("a different client address is unaffected by that block", r.status === 400, r.status);

    // --- per account + IP: brute-force control that cannot be turned into a lockout of the owner
    const V = await signup("rl-victim");
    check("victim account created for the lockout checks", V.r.status === 202 && V.exists && V.login?.status === 200, `${V.r.status} ${V.r.text} login=${V.login?.status}`);
    const bad = (em, ip) => fresh().call("POST", LOGIN, { email: em, password: "Wrong1234Pass" }, at(ip));
    const good = (ip, extra) => fresh().call("POST", LOGIN, { email: email("rl-victim"), password: PASSWORD }, at(ip, extra));
    let seq = []; for (let i = 0; i < 6; i++) seq.push((await bad(email("rl-victim"), ipN(21))).status);
    check("login per account+IP: 5 wrong passwords -> 401, the 6th -> 429", seq.join() === "401,401,401,401,401,429", seq.join());
    r = await good(ipN(21));
    check("while blocked, even the CORRECT password from that address is refused with 429 and no session", r.status === 429 && !hasSession(r), `${r.status} ${r.text}`);
    r = await good(ipN(22));
    check("the real owner on ANOTHER address is not locked out by that attacker (200 + session cookie)", r.status === 200 && hasSession(r), `${r.status} ${r.text}`);
    seq = []; for (let i = 0; i < 6; i++) seq.push((await bad(email("rl-nobody"), ipN(23))).status);
    check("a NON-EXISTENT account is throttled identically (5 x 401, then 429)", seq.join() === "401,401,401,401,401,429", seq.join());
    const realBlocked = await bad(email("rl-victim"), ipN(21)); const ghostBlocked = await bad(email("rl-nobody"), ipN(23));
    check("the 429 for an existing and a non-existent account is byte-identical (no enumeration through the limiter)", realBlocked.status === 429 && ghostBlocked.status === 429 && realBlocked.text === ghostBlocked.text, `${realBlocked.text} | ${ghostBlocked.text}`);
    const par = await Promise.all(Array.from({ length: 40 }, () => bad(email("rl-victim"), ipN(24))));
    const n401 = par.filter((x) => x.status === 401).length, n429 = par.filter((x) => x.status === 429).length;
    check("40 PARALLEL wrong-password logins (same account, same address): exactly 5 reach the password check", n401 === 5 && n429 === 35, `401=${n401} 429=${n429} other=${par.filter((x) => x.status !== 401 && x.status !== 429).map((x) => x.status).join(",")}`);
    r = await good(ipN(25), { "x-forwarded-for": "6.6.6.6" });
    const sessRow = await sql.query(`select s."ipAddress" as ip from sessions s join users u on u.id = s."userId" where u.email = $1 order by s."createdAt" desc limit 1`, [email("rl-victim")]);
    check("the session records the trusted address (x-real-ip), never the client's own x-forwarded-for", r.status === 200 && sessRow.rows[0]?.ip === ipN(25), `${r.status} stored=${sessRow.rows[0]?.ip}`);

    // --- shared addresses (CGNAT / office): successful logins do not consume the per-IP flood budget
    {
      const shared = ipN(60); const outcomes = [];
      for (let i = 0; i < 65; i++) outcomes.push((await fresh().call("POST", LOGIN, { email: email("rl-victim"), password: PASSWORD }, at(shared))).status);
      check("shared address: 65 SUCCESSFUL logins from one IP (limit 60 failures) are all accepted - the flood counter counts failures only", outcomes.every((x) => x === 200), [...new Set(outcomes)].join(","));
      const failed = []; for (let i = 0; i < 61; i++) failed.push((await fresh().call("POST", LOGIN, { email: email(`rl-stuff-${i}`), password: "Wrong1234Pass" }, at(shared))).status);
      check("shared address: after those successes, credential stuffing (61 FAILED logins across different accounts) is still stopped at the 61st with 429", failed.slice(0, 60).every((x) => x === 401) && failed[60] === 429, [...new Set(failed.slice(0, 60))].join(",") + " / " + failed[60]);
    }

    // --- every other public endpoint, per IP (counted before validation)
    for (const [pth, n, max] of [["/api/v1/auth/signup", 53, 10], ["/api/v1/auth/forgot-password", 54, 10], ["/api/v1/auth/reset-password", 55, 30], ["/api/v1/auth/verify-email", 56, 30], ["/api/v1/contact", 57, 10], ["/api/v1/ai/demo-generate", 58, 20]]) {
      const got = []; for (let i = 0; i <= max; i++) got.push((await fresh().call("POST", pth, {}, at(ipN(n)))).status);
      check(`${pth}: ${max} requests per IP per window reach validation (400), request ${max + 1} -> 429`, got.slice(0, max).every((x) => x === 400) && got[max] === 429, got.join(","));
    }

    // --- Redis hygiene
    if (redis) {
      const keys = await redis.keys("rl:v1:*");
      const ttls = await Promise.all(keys.map((k) => redis.pttl(k)));
      check("Redis: rate-limit keys exist and every one has a bounded expiry (none stranded without a TTL)", keys.length > 0 && ttls.every((t) => t > 0 && t <= 30 * 86_400_000), `keys=${keys.length} badTtl=${ttls.filter((t) => !(t > 0 && t <= 30 * 86_400_000)).length}`);
      const kinds = await Promise.all(keys.map((k) => redis.type(k)));
      const counters = keys.filter((k, i) => kinds[i] === "zset");
      const sizes = await Promise.all(counters.map((k) => redis.zcard(k)));
      check("Redis: counters are sliding-window logs (zset), flags are plain keys, and no counter holds more entries than the largest configured limit", counters.length > 0 && keys.every((k, i) => (k.includes(":known:") ? kinds[i] === "string" : kinds[i] === "zset")) && sizes.every((n) => n <= 600), `types=${[...new Set(kinds)].join(",")} max=${Math.max(0, ...sizes)}`);
      check("Redis: no rate-limit key contains an e-mail address", !keys.some((k) => /@|http-verify|example\.test/i.test(k)), keys.filter((k) => /@|http-verify|example\.test/i.test(k)).slice(0, 2).join(","));
    }

    // --- request bodies on the real server
    const J = { "Content-Type": "application/json" };
    const pad = (bytes) => { const base = JSON.stringify({ email: "a@example.test", password: "" }); return JSON.stringify({ email: "a@example.test", password: "p".repeat(bytes - Buffer.byteLength(base)) }); };
    check("test helper builds an exactly 8192-byte body", Buffer.byteLength(pad(8192)) === 8192, Buffer.byteLength(pad(8192)));
    r = await fresh().call("POST", LOGIN, undefined, { raw: pad(8192), headers: { ...J, "x-real-ip": ipN(31) } });
    check("login: a body of EXACTLY the 8 KiB limit is accepted by the reader (reaches the credential check: 401)", r.status === 401, `${r.status} ${r.text.slice(0, 120)}`);
    r = await fresh().call("POST", LOGIN, undefined, { raw: pad(8193), headers: { ...J, "x-real-ip": ipN(31) } });
    check("login: ONE byte over the limit -> 400 'too large'", r.status === 400 && /too large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    const chunks = new TextEncoder().encode(pad(20_000));
    const chunked = new ReadableStream({ start(c) { for (let i = 0; i < chunks.length; i += 1024) c.enqueue(chunks.slice(i, i + 1024)); c.close(); } });
    r = await fresh().call("POST", LOGIN, undefined, { raw: chunked, headers: { ...J, "x-real-ip": ipN(31) } });
    check("login: an oversized CHUNKED body with no Content-Length -> 400 'too large'", r.status === 400 && /too large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    r = await fresh().call("POST", LOGIN, undefined, { raw: "x".repeat(6_000_000), headers: { ...J, "x-real-ip": ipN(31) } });
    check("login: a 6 MB body (above the 4 MiB framework buffer) -> 400 'too large', not a crash or a truncated-JSON error", r.status === 400 && /too large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    r = await fresh().call("POST", LOGIN, undefined, { raw: pad(100), headers: { "Content-Type": "text/plain", "x-real-ip": ipN(31) } });
    check("login: Content-Type text/plain -> 415 UNSUPPORTED_MEDIA_TYPE", r.status === 415 && code(r) === "UNSUPPORTED_MEDIA_TYPE", `${r.status} ${r.text}`);
    const noType = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(pad(100))); c.close(); } });
    r = await fresh().call("POST", LOGIN, undefined, { raw: noType, headers: { "x-real-ip": ipN(31) } });
    check("login: no Content-Type at all -> 415", r.status === 415 && code(r) === "UNSUPPORTED_MEDIA_TYPE", `${r.status} ${r.text}`);
    r = await fresh().call("POST", LOGIN, undefined, { raw: pad(100), headers: { ...J, "Content-Encoding": "gzip", "x-real-ip": ipN(31) } });
    check("login: Content-Encoding gzip -> 415 (compressed bodies are never expanded)", r.status === 415, `${r.status} ${r.text}`);
    const bigControl = JSON.stringify({ name: "x".repeat(20_000) });
    r = await V.c.call("POST", "/api/v1/workspaces", undefined, { raw: bigControl, headers: J });
    check("authenticated POST /workspaces: a 20 KB body (control limit 16 KiB) -> 400 'too large'", r.status === 400 && /too large/i.test(r.text), `${r.status} ${r.text.slice(0, 120)}`);
    r = await fresh().call("POST", "/api/v1/workspaces", undefined, { raw: bigControl, headers: J });
    check("the same oversized body WITHOUT a session -> 401: authentication is still decided before the body is read", r.status === 401, `${r.status} ${r.text.slice(0, 120)}`);
    r = await anon.call("GET", "/api/v1/auth/me"); check("server still healthy after the oversized and malformed bodies", r.status === 401, r.status);

    // --- forgot-password: no existence oracle, and the deferred work really runs in the production server
    const fp = (em, ip) => fresh().call("POST", "/api/v1/auth/forgot-password", { email: em }, at(ip));
    // Issuing a token deletes the user's other unused ones, so the row COUNT stays 1; the hash of the live row is what changes.
    const tokenHash = async () => (await sql.query(`select t."tokenHash" as h from password_reset_tokens t join users u on u.id = t."userId" where u.email = $1 order by t."createdAt" desc limit 1`, [email("rl-victim")])).rows[0]?.h ?? null;
    const waitFor = async (pred, ms = 15_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await new Promise((res) => setTimeout(res, 250)); } return false; };
    const h0 = await tokenHash();
    const fe = await fp(email("rl-victim"), ipN(41)); const fu = await fp(email("rl-ghost"), ipN(42));
    check("forgot-password: an existing and an unknown address get the same 200 and body (the e-mail provider is unusable here, which used to make the existing case fail)", fe.status === 200 && fu.status === 200 && fe.text === fu.text, `${fe.status} ${fe.text} | ${fu.status} ${fu.text}`);
    check("forgot-password: the deferred work ran in the production server (a reset token appeared after the response)", await waitFor(async () => (await tokenHash()) !== h0), `hash before=${h0 === null ? "none" : "set"}`);
    // per-address limit is 3 per hour: request 1 (above) + 2 more issue tokens, the 4th and 5th must send nothing
    let prev = await tokenHash(); const issued = []; const same = [];
    for (let i = 0; i < 4; i++) {
      const x = await fp(email("rl-victim"), ipN(43 + i));
      same.push(x.status === 200 && x.text === fe.text);
      if (i < 2) { issued.push(await waitFor(async () => (await tokenHash()) !== prev)); prev = await tokenHash(); }
    }
    check("forgot-password: requests beyond the per-address limit get the SAME 200 and body as the allowed ones", same.every(Boolean), same.join());
    check("forgot-password: requests 2 and 3 for the address issued new tokens", issued.every(Boolean), issued.join());
    await new Promise((res) => setTimeout(res, 3_000));
    check("forgot-password: requests 4 and 5 (over the per-address limit) issued NOTHING", (await tokenHash()) === prev, "token changed after the limit was exceeded");
  }
} catch (e) {
  check("script completed without an unexpected exception", false, e?.stack ?? e);
} finally {
  const failed = results.filter((x) => !x.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed, ${failed.length} failed`);
  const outIdx = process.argv.indexOf("--out");
  if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify({ base: BASE, runId: run, results }, null, 1));
  await sql.end(); if (redis) redis.disconnect();
  process.exit(failed.length ? 1 : 0);
}
