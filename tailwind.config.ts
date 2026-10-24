/**
 * tailwind.config.ts
 *
 * Color tokens are wired to CSS variables (defined in src/styles/tokens.css)
 * rather than hardcoded hex values, so dark/light mode is a variable swap,
 * not a duplicated config. Typography, shadow, breakpoint, and layout
 * dimension tokens follow the same pattern — see src/styles/tokens.css for
 * the canonical documentation of each scale.
 */
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    // Default breakpoints extended with foldable/ultra-wide tiers per the
    // responsiveness requirement. `xs` covers small Android phones in
    // portrait; `3xl` covers ultra-wide monitors. Defaults (sm/md/lg/xl/2xl)
    // are kept at Tailwind's standard values intentionally — overriding
    // them would break every third-party Radix/shadcn pattern's assumptions.
    screens: {
      xs: "22.5rem", // 360px
      sm: "40rem", // 640px
      md: "48rem", // 768px
      lg: "64rem", // 1024px
      xl: "80rem", // 1280px
      "2xl": "96rem", // 1536px
      "3xl": "120rem", // 1920px — ultra-wide
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        surface: {
          sunken: "hsl(var(--surface-sunken))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 6px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "1rem" }],
        sm: ["var(--text-sm)", { lineHeight: "1.25rem" }],
        base: ["var(--text-base)", { lineHeight: "1.5rem" }],
        lg: ["var(--text-lg)", { lineHeight: "1.75rem" }],
        xl: ["var(--text-xl)", { lineHeight: "1.75rem" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "2rem" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "2.25rem" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "2.5rem" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "1.1" }],
        "6xl": ["var(--text-6xl)", { lineHeight: "1.05" }],
      },
      letterSpacing: {
        tighter: "var(--tracking-tighter)",
        tight: "var(--tracking-tight)",
        normal: "var(--tracking-normal)",
        wide: "var(--tracking-wide)",
        widest: "var(--tracking-widest)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "glow-primary": "var(--shadow-glow-primary)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        moderate: "var(--duration-moderate)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        decelerate: "var(--ease-decelerate)",
        accelerate: "var(--ease-accelerate)",
        expressive: "var(--ease-expressive)",
      },
      spacing: {
        "sidebar": "var(--layout-sidebar-width)",
        "sidebar-collapsed": "var(--layout-sidebar-collapsed)",
        "topbar": "var(--layout-topbar-height)",
      },
      maxWidth: {
        content: "var(--layout-content-max-width)",
        reading: "var(--layout-reading-max-width)",
      },
      zIndex: {
        dropdown:          "var(--z-dropdown)",
        sticky:            "var(--z-sticky)",
        drawer:            "var(--z-drawer)",
        "modal-backdrop":  "var(--z-modal-backdrop)",
        modal:             "var(--z-modal)",
        popover:           "var(--z-popover)",
        "command-palette": "var(--z-command-palette)",
        toast:             "var(--z-toast)",
        tooltip:           "var(--z-tooltip)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.96)" },
        },
        "slide-in-from-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-to-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-standard)",
        "accordion-up": "accordion-up 0.2s var(--ease-standard)",
        "fade-in": "fade-in var(--duration-base) var(--ease-decelerate)",
        "fade-out": "fade-out var(--duration-fast) var(--ease-accelerate)",
        "scale-in": "scale-in var(--duration-base) var(--ease-decelerate)",
        "scale-out": "scale-out var(--duration-fast) var(--ease-accelerate)",
        "slide-in-from-right": "slide-in-from-right var(--duration-moderate) var(--ease-decelerate)",
        "slide-out-to-right": "slide-out-to-right var(--duration-moderate) var(--ease-accelerate)",
        "slide-in-from-bottom": "slide-in-from-bottom var(--duration-base) var(--ease-decelerate)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
