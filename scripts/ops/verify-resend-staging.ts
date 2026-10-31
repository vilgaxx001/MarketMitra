/**
 * Genuine Resend delivery check for STAGING (and any environment you are allowed to send test mail from).
 *
 *   STAGING_TEST_RECIPIENT=you@your-real-mailbox.example \
 *   <load the staging environment: EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM on a verified Resend domain, SESSION_SECRET, ...> \
 *     npx tsx scripts/ops/verify-resend-staging.ts
 *
 * What it proves, and how:
 *   1. SEND through the application's own adapter (`sendEmail` in src/lib/email.ts, Resend SDK 6.x) - not a mock, not a reimplementation.
 *   2. ACCEPTED: the adapter returns the provider's message id (Resend `data.id`). No id = failure.
 *   3. DELIVERED: it asks Resend's API (`emails.get(id)`) for the message's `last_event` until it is `delivered`
 *      (`bounced`, `complained`, `failed`, `canceled`, `suppressed` fail; no final state within the timeout = exit 3, "accepted, delivery NOT confirmed").
 *   4. NO LEAKS: the send runs in a CHILD process whose entire stdout/stderr (the application's real log lines) is captured and scanned
 *      for the recipient address (full, and its local part), the API key and the session secret. Any hit fails the check.
 *
 * It refuses to run with a placeholder/CI key or without an explicit recipient, never prints the key or the recipient (the report shows only
 * the recipient DOMAIN and the keyed log reference), and sends exactly ONE message. Exit codes: 0 delivered and clean, 1 failed,
 * 2 refused to run (configuration), 3 accepted but delivery not confirmed in time.
 */
import { spawn } from "node:child_process";

const CHILD = process.argv.includes("--child");
const TIMEOUT_MS = Number(process.env.STAGING_DELIVERY_TIMEOUT_MS ?? 120_000);
const FINAL_BAD = new Set(["bounced", "complained", "failed", "canceled", "suppressed"]);

function refuse(msg: string): never {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

function preconditions() {
  const to = process.env.STAGING_TEST_RECIPIENT?.trim();
  const key = process.env.RESEND_API_KEY ?? "";
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) refuse("set STAGING_TEST_RECIPIENT to a real mailbox you control.");
  if (process.env.EMAIL_PROVIDER !== "resend") refuse("EMAIL_PROVIDER must be 'resend'.");
  if (!/^re_[A-Za-z0-9_]{16,}$/.test(key) || /placeholder|not_a_credential|test_not_real|example/i.test(key)) refuse("RESEND_API_KEY is missing or looks like a placeholder; this check needs a real staging key.");
  if (/@example\.(test|com|org)$/i.test(process.env.EMAIL_FROM ?? "") || !process.env.EMAIL_FROM) refuse("EMAIL_FROM must be an address on a domain verified in Resend.");
  if (/@(example\.(test|com|org)|localhost)$/i.test(to)) refuse("STAGING_TEST_RECIPIENT must be a deliverable mailbox, not an example domain.");
  return { to: to!, key };
}

async function child() {
  const { to } = preconditions();
  const { sendEmail } = await import("@/lib/email");
  const runId = new Date().toISOString();
  const result = await sendEmail({
    to,
    subject: `MarketMitra staging e-mail check ${runId}`,
    html: `<p>This is a one-off delivery check from the MarketMitra staging environment (${runId}). No action is needed.</p>`,
    text: `This is a one-off delivery check from the MarketMitra staging environment (${runId}). No action is needed.`,
  });
  console.log(`RESULT:${JSON.stringify({ messageId: result.messageId ?? null })}`);
}

async function parent() {
  const { to, key } = preconditions();
  const secret = process.env.SESSION_SECRET ?? "";
  const run = spawn(process.execPath, [...process.execArgv, process.argv[1]!, "--child"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let captured = "";
  run.stdout.on("data", (b) => (captured += b)); run.stderr.on("data", (b) => (captured += b));
  const code: number = await new Promise((res) => run.on("close", (c) => res(c ?? 1)));

  const found = (needle: string) => needle.length >= 6 && captured.toLowerCase().includes(needle.toLowerCase());
  const leaks = [
    found(to) && "recipient address", found(to.split("@")[0]!) && "recipient local part", found(key) && "RESEND_API_KEY", found(secret) && "SESSION_SECRET",
  ].filter(Boolean) as string[];
  const line = captured.split("\n").find((l) => l.startsWith("RESULT:"));
  const messageId: string | null = line ? JSON.parse(line.slice(7)).messageId : null;
  const sentLog = captured.split("\n").filter((l) => l.includes("Email sent via Resend")).map((l) => { try { const j = JSON.parse(l); return { messageId: j.messageId, recipientDomain: j.recipientDomain, recipientRef: j.recipientRef }; } catch { return null; } }).find(Boolean);

  const report: Record<string, unknown> = { sendExitCode: code, accepted: Boolean(messageId), messageId, recipientDomain: to.split("@")[1], logLines: captured.split("\n").filter(Boolean).length, loggedSendEvent: sentLog ?? null, logLeaks: leaks };
  if (code !== 0 || !messageId) { report.verdict = "FAILED: the application could not send (see exit code; run the child step directly for details)"; console.log(JSON.stringify(report, null, 2)); process.exit(1); }
  if (leaks.length) { report.verdict = `FAILED: application logs exposed: ${leaks.join(", ")}`; console.log(JSON.stringify(report, null, 2)); process.exit(1); }

  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const deadline = Date.now() + TIMEOUT_MS; let last: string | null = null;
  while (Date.now() < deadline) {
    const { data, error } = await resend.emails.get(messageId);
    if (error) { report.verdict = `FAILED: provider status lookup error (${error.name} ${error.statusCode})`; console.log(JSON.stringify(report, null, 2)); process.exit(1); }
    last = (data as { last_event?: string } | null)?.last_event ?? null;
    if (last === "delivered") { report.providerStatus = last; report.verdict = "DELIVERED: accepted by Resend, confirmed delivered by Resend's API, and no recipient address or secret appeared in the application logs."; console.log(JSON.stringify(report, null, 2)); process.exit(0); }
    if (last && FINAL_BAD.has(last)) { report.providerStatus = last; report.verdict = `FAILED: provider reports '${last}'`; console.log(JSON.stringify(report, null, 2)); process.exit(1); }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  report.providerStatus = last; report.verdict = "NOT CONFIRMED: accepted by Resend but no final delivery state within the timeout; check the Resend dashboard for this message id.";
  console.log(JSON.stringify(report, null, 2)); process.exit(3);
}

(CHILD ? child() : parent()).catch((err) => { console.error(`ERROR: ${err instanceof Error ? err.name : "unknown"}`); process.exit(1); });
