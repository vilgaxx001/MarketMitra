/**
 * MODULE 5B.5 regression: Next.js 15's generated route validator (.next/types) requires a route export's second
 * argument to be exactly `{ params: Promise<...> }` (not optional) and a param-less route to take no second argument.
 * The type assertions below are enforced by `tsc --noEmit` (vitest only executes the runtime half). Reverting
 * withApiHandler to `(req, context?: ...)` makes tsc fail here.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { NextResponse } from "next/server";
import { withApiHandler, ApiException } from "@/lib/api-response";

const ok = async () => NextResponse.json({ ok: true });

describe("withApiHandler exported handler type (what Next.js validates)", () => {
  it("a route without dynamic segments takes exactly one argument", () => {
    const h = withApiHandler(ok);
    expectTypeOf(h).parameters.toEqualTypeOf<[Request]>();
    expectTypeOf(h).returns.resolves.toEqualTypeOf<NextResponse>();
  });
  it("a route with dynamic segments requires a non-optional { params: Promise<...> } second argument", () => {
    const h = withApiHandler<{ workspaceSlug: string }>(ok);
    expectTypeOf(h).parameter(1).toEqualTypeOf<{ params: Promise<{ workspaceSlug: string }> }>();
    expectTypeOf(h).parameters.toEqualTypeOf<[Request, { params: Promise<{ workspaceSlug: string }> }]>();
  });
  it("still converts thrown ApiExceptions into the standard error response, with and without context", async () => {
    const boom = withApiHandler(async () => { throw new ApiException("FORBIDDEN", "nope"); });
    expect((await boom(new Request("http://x"))).status).toBe(403);
    const boom2 = withApiHandler<{ id: string }>(async () => { throw new ApiException("FORBIDDEN", "nope"); });
    expect((await boom2(new Request("http://x"), { params: Promise.resolve({ id: "1" }) })).status).toBe(403);
  });
  it("passes the context through to the handler", async () => {
    const h = withApiHandler<{ id: string }>(async (_req, { params }) => NextResponse.json({ id: (await params).id }));
    const res = await h(new Request("http://x"), { params: Promise.resolve({ id: "abc" }) });
    expect(await res.json()).toEqual({ id: "abc" });
  });
});
