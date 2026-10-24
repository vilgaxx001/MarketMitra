/**
 * src/components/ui/index.ts
 *
 * Barrel export for the entire UI component library.
 *
 * USAGE in any module:
 *   import { Button, Card, Badge, Input } from "@/components/ui";
 *
 * WHY: prevents deeply nested relative imports across the codebase and
 * makes the component library's public API explicit — if a component isn't
 * exported here, it isn't considered part of the public design system.
 */

export * from "./accordion";
export * from "./alert";
export * from "./avatar";
export * from "./badge";
export * from "./breadcrumb";
export * from "./button";
export * from "./calendar";
export * from "./card";
export * from "./chart";
export * from "./checkbox";
export * from "./context-menu";
export * from "./date-picker";
export * from "./dialog";
export * from "./drawer";
export * from "./dropdown-menu";
export * from "./file-upload";
export * from "./input";
export * from "./label";
export * from "./pagination";
export * from "./popover";
export * from "./progress";
export * from "./radio-group";
export * from "./search-input";
export * from "./select";
export * from "./skeleton";
export * from "./switch";
export * from "./table";
export * from "./tabs";
export * from "./textarea";
export * from "./toast";
export * from "./tooltip";
