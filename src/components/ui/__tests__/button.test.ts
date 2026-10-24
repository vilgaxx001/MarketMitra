/**
 * Regression: `<Button asChild>` threw "React.Children.only expected to receive a single React element child" because it
 * passed [leadingIcon, children, trailingIcon] to Radix <Slot>. Every page rendering one (marketing nav, pricing,
 * not-found) answered 500. REAL: React server rendering of the real Button and Radix Slot. DOUBLES: none.
 */
import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("asChild renders the single child element (an <a>) with the button classes, and does not throw", () => {
    const html = renderToStaticMarkup(h(Button, { asChild: true, variant: "ghost", size: "sm" }, h("a", { href: "/login" }, "Log in")));
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/login"');
    expect(html).toContain("Log in");
    expect(html).toContain("inline-flex");
    expect(html).not.toContain("<button");
  });
  it("asChild + isLoading still renders one element, marks aria-busy and aria-disabled", () => {
    const html = renderToStaticMarkup(h(Button, { asChild: true, isLoading: true }, h("a", { href: "/x" }, "Go")));
    expect(html).toMatch(/^<a /);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
  });
  it("default mode is unchanged: a <button> with leading/trailing icons and a spinner while loading", () => {
    const icon = (t: string) => h("i", { "data-t": t });
    const plain = renderToStaticMarkup(h(Button, { leadingIcon: icon("lead"), trailingIcon: icon("trail") }, "Save"));
    expect(plain).toMatch(/^<button /);
    expect(plain.indexOf("lead")).toBeLessThan(plain.indexOf("Save"));
    expect(plain.indexOf("Save")).toBeLessThan(plain.indexOf("trail"));
    const loading = renderToStaticMarkup(h(Button, { isLoading: true, leadingIcon: icon("lead"), trailingIcon: icon("trail") }, "Save"));
    expect(loading).toContain("disabled");
    expect(loading).toContain("animate-spin");
    expect(loading).not.toContain("data-t");
  });
});
