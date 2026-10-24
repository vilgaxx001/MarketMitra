/**
 * src/lib/api-response.ts
 *
 * Standard REST response envelope for every route under src/app/api/v1/*.
 *
 * Every successful response has the shape:
 *   { data: T, meta?: { pagination?: ... } }
 *
 * Every error response has the shape:
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * WHY: requirement #17 ("all APIs follow REST conventions with clear
 * validation and error responses"). A single shape means the frontend's
 * API client (src/lib/api-client.ts, Module 2+) can handle every endpoint
 * generically instead of each component guessing a response shape.
 *
 * Error codes are stable strings (not just HTTP status codes) so frontend
 * code can branch on *why* something failed (e.g. "VALIDATION_ERROR" vs
 * "WORKSPACE_LIMIT_REACHED") without parsing human-readable messages.
 */

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

export type ApiSuccess<T> = {
  data: T;
  meta?: {
    pagination?: {
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
    };
    [key: string]: unknown;
  };
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "FEATURE_NOT_AVAILABLE"
  | "PROVIDER_ERROR"
  | "PAYMENT_REQUIRED"
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  FEATURE_NOT_AVAILABLE: 403,
  PROVIDER_ERROR: 502,
  PAYMENT_REQUIRED: 402,
  INTERNAL_ERROR: 500,
};

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

export function apiSuccess<T>(data: T, meta?: ApiSuccess<T>["meta"], status = 200) {
  const body: ApiSuccess<T> = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: { code, message, details } },
    { status: STATUS_BY_CODE[code] }
  );
}

/** Converts a Zod validation failure into a standard VALIDATION_ERROR response. */
export function apiValidationError(zodError: ZodError) {
  return apiError(
    "VALIDATION_ERROR",
    "One or more fields are invalid.",
    zodError.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }))
  );
}

/**
 * Typed application error that route handlers can throw and a single
 * try/catch (or the route wrapper below) converts into the right response.
 */
export class ApiException extends Error {
  code: ApiErrorCode;
  details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiException";
    this.code = code;
    this.details = details;
  }
}

/**
 * Wraps a route handler with centralized error handling so individual
 * routes don't each reimplement try/catch + logging + response shaping.
 *
 * USAGE:
 *   export const POST = withApiHandler(async (req) => {
 *     const body = schema.parse(await req.json()); // throws ZodError
 *     if (!allowed) throw new ApiException("FORBIDDEN", "...");
 *     return apiSuccess(result);
 *   });
 */
/**
 * Wraps a route handler with centralized error handling so individual
 * routes don't each reimplement try/catch + logging + response shaping.
 *
 * USAGE (no dynamic segments):
 *   export const POST = withApiHandler(async (req) => {
 *     const body = schema.parse(await req.json()); // throws ZodError
 *     if (!allowed) throw new ApiException("FORBIDDEN", "...");
 *     return apiSuccess(result);
 *   });
 *
 * USAGE (dynamic segments, e.g. src/app/api/v1/workspaces/[workspaceSlug]/route.ts):
 *   export const GET = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
 *     const { workspaceSlug } = await params;
 *     ...
 *   });
 */
/**
 * The exported handler type. Next.js 15's generated route validator (`.next/types`) requires the second argument
 * of a route export to be exactly `{ params: Promise<...> }` (not optional, not `Promise<undefined>`), and a route
 * with no dynamic segments to take no second argument at all. The previous return type,
 * `(req, context?: { params: Promise<TParams> })`, failed that check for every wrapped route (found in 5B.5).
 */
export type ApiRouteHandler<TParams> = TParams extends undefined
  ? (req: Request) => Promise<NextResponse>
  : (req: Request, context: { params: Promise<TParams> }) => Promise<NextResponse>;

export function withApiHandler<TParams = undefined>(handler: ApiRouteHandler<TParams>): ApiRouteHandler<TParams> {
  const wrapped = async (req: Request, context?: { params: Promise<TParams> }): Promise<NextResponse> => {
    try {
      return await (handler as (req: Request, context?: { params: Promise<TParams> }) => Promise<NextResponse>)(
        req,
        context
      );
    } catch (err) {
      return await handleRouteError(err);
    }
  };
  return wrapped as unknown as ApiRouteHandler<TParams>;
}

async function handleRouteError(err: unknown): Promise<NextResponse> {
  // Lazy import to avoid a circular dependency between this file and logger
  // consumers that themselves construct API responses.
  const { logger } = await import("@/lib/logger");

  if (err instanceof ApiException) {
    return apiError(err.code, err.message, err.details);
  }

  // Zod errors thrown directly (e.g. `schema.parse(...)`)
  if (typeof err === "object" && err !== null && "issues" in err) {
    return apiValidationError(err as ZodError);
  }

  // `await req.json()` on a malformed or empty body throws a SyntaxError whose message mentions JSON. That is a CLIENT error:
  // answering 500 (and logging it as an unhandled server error) turned every bad request into a false alert. The parser's own
  // message is never echoed. Other SyntaxErrors (no "JSON" in the message) remain server faults.
  if (err instanceof SyntaxError && /JSON/i.test(err.message)) {
    return apiError("VALIDATION_ERROR", "The request body must be valid JSON.");
  }

  logger.error({ msg: "Unhandled API error", err });
  return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.");
}
