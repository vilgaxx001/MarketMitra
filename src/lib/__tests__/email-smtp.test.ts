/**
 * SMTP provider (EMAIL_PROVIDER=smtp) - behaviour over a REAL SMTP conversation.
 *
 * Why this file exists: the SMTP path used to depend on a `nodemailer` package that was not declared, so the provider the env schema,
 * .env.example and docs offered could not work and the build warned "Module not found: nodemailer". It is now a declared dependency,
 * and these tests prove the provider works and stays safe.
 *
 * REAL: the `nodemailer` library, TCP sockets, the SMTP protocol (EHLO / AUTH PLAIN / MAIL / RCPT / DATA / QUIT) against a minimal
 * in-process server defined below, and all of src/lib/email.ts. DOUBLES: env (a mutable object), the logger (to read what is logged)
 * and the `resend` SDK (only to prove it is not called).
 *
 * NOT covered here (needs a real relay, see docs/EMAIL_AND_ACCOUNT_SECURITY.md): a successful STARTTLS upgrade against a
 * certificate-trusted server, and delivery to a mailbox. The server below cannot present a trusted certificate, and the code (rightly)
 * offers no switch to skip certificate verification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";

const m = vi.hoisted(() => ({ send: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn(), env: {} as Record<string, unknown> }));
vi.mock("@/lib/env", () => ({ env: m.env, isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { info: m.info, error: m.error, warn: m.warn, debug: vi.fn() } }));
vi.mock("resend", () => ({ Resend: class { emails = { send: m.send }; } }));

import { sendEmail, smtpTransportOptions, assertSingleRecipient } from "@/lib/email";

const PASSWORD = "s3cr3t-smtp-password-value";
const RECIPIENT = "jane.doe+news@recipient.example.test";

type Captured = { connections: number; commands: string[]; mailFrom: string; rcpt: string[]; data: string; authSeen: boolean };
interface FakeOptions { authReply?: string; rcptReply?: string }

/** A minimal SMTP server: speaks the real protocol, records what a client sends. It does not offer STARTTLS. */
async function startSmtp(o: FakeOptions = {}) {
  const cap: Captured = { connections: 0, commands: [], mailFrom: "", rcpt: [], data: "", authSeen: false };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    cap.connections++;
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => undefined);
    let buf = "";
    let inData = false;
    const send = (line: string) => sock.write(`${line}\r\n`);
    send("220 fake.test ESMTP ready");
    sock.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end === -1) return;
          cap.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          send("250 2.0.0 OK queued as FAKE1");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const verb = line.split(/[ :]/)[0]!.toUpperCase();
        cap.commands.push(verb);
        if (verb === "EHLO" || verb === "HELO") { send("250-fake.test"); send("250-AUTH PLAIN"); send("250 8BITMIME"); }
        else if (verb === "AUTH") { cap.authSeen = true; send(o.authReply ?? "235 2.7.0 Authentication successful"); }
        else if (verb === "MAIL") { cap.mailFrom = /<([^>]*)>/.exec(line)?.[1] ?? ""; send("250 2.1.0 OK"); }
        else if (verb === "RCPT") { cap.rcpt.push(/<([^>]*)>/.exec(line)?.[1] ?? ""); send(o.rcptReply ?? "250 2.1.5 OK"); }
        else if (verb === "DATA") { inData = true; send("354 end data with <CR><LF>.<CR><LF>"); }
        else if (verb === "RSET" || verb === "NOOP") send("250 OK");
        else if (verb === "QUIT") { send("221 bye"); sock.end(); }
        else send("502 5.5.2 command not recognized");
      }
    });
  });
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as net.AddressInfo).port;
  const close = () => new Promise<void>((res) => { sockets.forEach((s) => s.destroy()); server.close(() => res()); });
  return { port, cap, close };
}

const logged = () => JSON.stringify([...m.info.mock.calls, ...m.error.mock.calls, ...m.warn.mock.calls]);
const headerBlock = (raw: string) => raw.split("\r\n\r\n")[0] ?? "";
const mail = (over: Partial<{ to: string; subject: string }> = {}) => ({ to: RECIPIENT, subject: "Your sign-in link", html: "<p>Hello there</p>", text: "Hello there", ...over });

let relay: Awaited<ReturnType<typeof startSmtp>> | undefined;
const setEnv = (port: number, over: Record<string, unknown> = {}) => {
  for (const k of Object.keys(m.env)) delete m.env[k];
  Object.assign(m.env, {
    EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: port, SMTP_USER: "apikey", SMTP_PASSWORD: PASSWORD, SMTP_REQUIRE_TLS: "false",
    EMAIL_FROM: "noreply@sender.example.test", SESSION_SECRET: "unit-test-secret-unit-test-secret-1234", RESEND_API_KEY: "re_unit_test_key", ...over,
  });
};
beforeEach(() => { [m.send, m.info, m.error, m.warn].forEach((f) => f.mockReset()); });
afterEach(async () => { await relay?.close(); relay = undefined; });

describe("delivery over a real SMTP conversation", () => {
  it("authenticates, sends exactly one message to exactly one recipient, and returns the Message-ID", async () => {
    relay = await startSmtp(); setEnv(relay.port);
    const res = await sendEmail(mail());
    expect(res.messageId).toMatch(/^<[^<>\s]+@[^<>\s]+>$/);
    expect(relay.cap.authSeen).toBe(true);
    expect(relay.cap.mailFrom).toBe("noreply@sender.example.test");
    expect(relay.cap.rcpt).toEqual([RECIPIENT]);
    expect(relay.cap.commands.filter((c) => c === "DATA")).toHaveLength(1);
    const head = headerBlock(relay.cap.data);
    expect(head).toMatch(/^Subject: Your sign-in link$/m);
    expect(head).toMatch(/^From: noreply@sender\.example\.test$/m);
    expect(head).toMatch(/^Content-Type: multipart\/alternative;/m);
    expect(relay.cap.data).toContain("Hello there");
    expect(relay.cap.data).toContain("<p>Hello there</p>");
  });

  it("logs the provider, message id, recipient domain and keyed reference, and NOTHING that identifies the recipient or the credentials", async () => {
    relay = await startSmtp(); setEnv(relay.port);
    const { messageId } = await sendEmail(mail());
    expect(m.info).toHaveBeenCalledWith(expect.objectContaining({ msg: "Email sent via SMTP", provider: "smtp", messageId, recipientDomain: "recipient.example.test", recipientRef: expect.stringMatching(/^[0-9a-f]{12}$/) }));
    const all = logged();
    for (const secret of [RECIPIENT, "jane.doe", PASSWORD, "apikey"]) expect(all).not.toContain(secret);
  });

  it("a subject carrying a line break cannot add a header or a recipient", async () => {
    relay = await startSmtp(); setEnv(relay.port);
    await sendEmail(mail({ subject: "Hi\r\nBcc: evil@attacker.example.test\r\nX-Injected: 1" }));
    const head = headerBlock(relay.cap.data);
    expect(head).not.toMatch(/^Bcc:/im);
    expect(head).not.toMatch(/^X-Injected:/im);
    expect(relay.cap.rcpt).toEqual([RECIPIENT]);
  });
});

describe("the recipient must be exactly one plain mailbox (every provider)", () => {
  const BAD = ["a@x.test, b@y.test", "a@x.test;b@y.test", '"Name" <a@x.test>', "<a@x.test>", "a@x.test\r\nBcc: e@y.test", "a@x.test\nb@y.test", "a b@x.test", "no-at-sign", "@x.test", "a@", "", "a@@x.test", `${"a".repeat(250)}@x.test`];
  it.each(BAD)("refuses %j before any provider is contacted, without echoing the value", async (to) => {
    relay = await startSmtp(); setEnv(relay.port);
    const err = await sendEmail(mail({ to })).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Invalid recipient/);
    expect((err as Error).message).not.toContain(to.slice(0, 8) || "\u0000");
    expect(relay.cap.connections).toBe(0);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("the same rule protects the Resend path", async () => {
    setEnv(1, { EMAIL_PROVIDER: "resend" });
    await expect(sendEmail(mail({ to: "a@x.test, b@y.test" }))).rejects.toThrow(/^Invalid recipient/);
    expect(m.send).not.toHaveBeenCalled();
  });
  it.each(["jane@x.test", "jane.doe+tag@sub.example.test", "o'brien@x.test", "user_name-1@xn--bcher-kva.example", "ünïcode@exämple.test"])("accepts the ordinary mailbox %s", (to) => {
    expect(() => assertSingleRecipient(to)).not.toThrow();
  });
});

describe("TLS is required by default", () => {
  it("against a server that does not offer STARTTLS the send is refused BEFORE credentials or any message are sent", async () => {
    relay = await startSmtp(); setEnv(relay.port, { SMTP_REQUIRE_TLS: undefined });
    await expect(sendEmail(mail())).rejects.toThrow(/^Email delivery failed/);
    expect(relay.cap.authSeen).toBe(false);
    expect(relay.cap.commands).not.toContain("MAIL");
    expect(relay.cap.commands).not.toContain("DATA");
    expect(logged()).not.toContain(PASSWORD);
    expect(m.error).toHaveBeenCalledWith(expect.objectContaining({ msg: "SMTP email failed", provider: "smtp" }));
  });
  it("SMTP_REQUIRE_TLS=false (development relay) is what allows the plaintext conversation", async () => {
    relay = await startSmtp(); setEnv(relay.port, { SMTP_REQUIRE_TLS: "false" });
    await expect(sendEmail(mail())).resolves.toMatchObject({ messageId: expect.any(String) });
  });
});

describe("failures never leak the recipient or the credentials", () => {
  it("authentication rejected: throws, logs the failure, does not echo the password", async () => {
    relay = await startSmtp({ authReply: "535 5.7.8 Authentication credentials invalid" }); setEnv(relay.port);
    const err = await sendEmail(mail()).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^Email delivery failed/);
    expect((err as Error).message).not.toContain(PASSWORD);
    expect(relay.cap.commands).not.toContain("DATA");
    expect(logged()).not.toContain(PASSWORD);
    expect(m.error).toHaveBeenCalledWith(expect.objectContaining({ msg: "SMTP email failed", provider: "smtp" }));
  });
  it("a relay that echoes the refused address in its reply: the address is redacted from the thrown error and from the logs", async () => {
    relay = await startSmtp({ rcptReply: `550 5.1.1 <${RECIPIENT}>: Recipient address rejected: user unknown` }); setEnv(relay.port);
    const err = await sendEmail(mail()).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^Email delivery failed/);
    expect((err as Error).message).toContain("550");
    for (const s of [RECIPIENT, "jane.doe"]) {
      expect((err as Error).message).not.toContain(s);
      expect(logged()).not.toContain(s);
    }
    expect(relay.cap.commands).not.toContain("DATA");
  });
  it("an unreachable relay fails with a delivery error instead of hanging or succeeding", async () => {
    relay = await startSmtp(); const port = relay.port; await relay.close(); relay = undefined;
    setEnv(port);
    await expect(sendEmail(mail())).rejects.toThrow(/^Email delivery failed/);
  });
});

describe("transport options (the security-relevant settings, asserted rather than assumed)", () => {
  const opts = (over: Record<string, unknown>) => { setEnv(587, over); return smtpTransportOptions(); };
  it("requires TLS on the submission ports by default, and uses implicit TLS on 465", () => {
    expect(opts({ SMTP_PORT: 587, SMTP_REQUIRE_TLS: undefined })).toMatchObject({ secure: false, requireTLS: true });
    expect(opts({ SMTP_PORT: undefined, SMTP_REQUIRE_TLS: "true" })).toMatchObject({ port: 587, secure: false, requireTLS: true });
    expect(opts({ SMTP_PORT: 25, SMTP_REQUIRE_TLS: undefined })).toMatchObject({ secure: false, requireTLS: true });
    expect(opts({ SMTP_PORT: 465 })).toMatchObject({ secure: true, requireTLS: false });
  });
  it("only an explicit SMTP_REQUIRE_TLS=false turns the requirement off", () => {
    expect(opts({ SMTP_PORT: 1025, SMTP_REQUIRE_TLS: "false" }).requireTLS).toBe(false);
  });
  it("verifies certificates (no override), sets a TLS 1.2 floor, bounds every wait, and forbids files and URLs as content", () => {
    const o = opts({ SMTP_PORT: 587, SMTP_REQUIRE_TLS: undefined });
    expect(o.tls).toEqual({ minVersion: "TLSv1.2" });
    expect(JSON.stringify(o)).not.toMatch(/rejectUnauthorized/);
    for (const t of [o.connectionTimeout, o.greetingTimeout, o.socketTimeout]) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(30_000); }
    expect(o.disableFileAccess).toBe(true);
    expect(o.disableUrlAccess).toBe(true);
  });
});
