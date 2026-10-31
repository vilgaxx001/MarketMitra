/**
 * src/lib/log-redaction.ts
 *
 * The pino redaction configuration, in a module with no dependencies so tests can exercise the REAL configuration without
 * loading the logger (and the environment) behind it.
 */
/** Fields that must never reach a log line (exported so tests exercise the real configuration). */
export const LOG_REDACTION = {
  // Defense in depth — never let secrets/PII leak into log output even
  // if a caller accidentally logs a full object containing them.
  paths: [
    "*.password",
    "*.passwordHash",
    "*.token",
    "*.tokenHash",
    "*.secret",
    "*.apiKey",
    "*.authorization",
    "req.headers.authorization",
    "req.headers.cookie",
    // Recipient / account e-mail addresses are personal data: never in logs, at the top level or one level down.
    "to",
    "email",
    "recipient",
    "*.to",
    "*.email",
    "*.recipient",
  ],
  censor: "[REDACTED]",
};
