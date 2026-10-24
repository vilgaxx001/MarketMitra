# Self-hosted fonts

`inter-latin-wght-normal.woff2` is the **Inter** variable font (latin subset, weights 100-900), taken unmodified from the npm
package `@fontsource-variable/inter@5.2.8` (SHA-256 in PRE_5C_RELEASE_GATE_REPORT.md).
Licence: SIL Open Font License 1.1 - full text in `Inter-OFL-1.1.txt` (must ship with the font).

It replaces `next/font/google`, which fetched `https://fonts.googleapis.com` during `next build` and made production builds
depend on outbound network access. Same family, same subset, same weight range, same CSS variable (`--font-sans`) and
`display: "swap"`, so the rendered UI is unchanged.
