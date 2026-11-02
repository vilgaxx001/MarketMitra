/**
 * src/lib/logger.ts
 *
 * Structured logging adapter.
 *
 * This wraps `pino` behind a small interface so the rest of the app never
 * imports pino directly. That indirection is deliberate (req #13 — proper
 * logging/monitoring): if we ever swap logging libraries, every call site
 * (`logger.info(...)`, `logger.error(...)`) stays unchanged — only this
 * file's internals change.
 *
 * USAGE:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ msg: "Workspace created", workspaceId });
 *   logger.error({ msg: "Generation failed", err, workspaceId });
 *
 * Always log structured objects (not string concatenation) so logs are
 * queryable in production (e.g. in Datadog/CloudWatch/Logtail).
 */

import pino from "pino";
import { env, isProduction } from "@/lib/env";
import { LOG_REDACTION } from "@/lib/log-redaction";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty-print in development for human readability; structured JSON in
  // production for log aggregation tools.
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
  base: {
    env: env.NODE_ENV,
    app: env.APP_NAME,
  },
  redact: LOG_REDACTION,
});

/**
 * Child logger scoped to a request/workspace, so every log line in a
 * request's lifecycle is automatically tagged for correlation.
 */
export function createRequestLogger(context: {
  requestId: string;
  workspaceId?: string;
  userId?: string;
}) {
  return logger.child(context);
}
