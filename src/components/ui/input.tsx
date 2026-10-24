/**
 * src/components/ui/input.tsx
 *
 * Text input primitive. Validation styling is driven by the `aria-invalid`
 * attribute rather than a separate `error` boolean prop — this means it
 * composes directly with React Hook Form's `{...register("field")}` output
 * (which sets aria-invalid automatically when paired with our FormField
 * wrapper in Module 3+) without any extra glue code.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered inside the input on the left (e.g. search icon, currency symbol). */
  startIcon?: React.ReactNode;
  /** Icon or element rendered inside the input on the right (e.g. clear button, password toggle). */
  endIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", startIcon, endIcon, ...props }, ref) => {
    if (startIcon || endIcon) {
      return (
        <div className="relative flex items-center">
          {startIcon && (
            <span className="pointer-events-none absolute left-3 flex items-center text-muted-foreground [&_svg]:size-4">
              {startIcon}
            </span>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs",
              "transition-colors duration-fast ease-standard",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
              startIcon && "pl-9",
              endIcon && "pr-9",
              className
            )}
            {...props}
          />
          {endIcon && (
            <span className="absolute right-3 flex items-center text-muted-foreground [&_svg]:size-4">
              {endIcon}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs",
          "transition-colors duration-fast ease-standard",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
