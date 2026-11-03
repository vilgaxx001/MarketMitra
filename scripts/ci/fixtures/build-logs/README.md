# Build-log fixtures for `scripts/ci/assert-build-log.mjs`

All four files are REAL output, not hand-written text. Paths are normalised to the CI runner path.

| File | Source | Expected |
|---|---|---|
| `clean-real-ci.txt` | the `build` gate section of CI run 41449971382 (the clean build after the nodemailer fix) | guard passes; contains legitimate warnings (`No build cache found`, `[env] WARNING:`) that must NOT fail |
| `nodemailer-warning-real-ci.txt` | the `build` gate section of CI run 41228134426 (the build that shipped green with the defect) | guard fails: `Module not found: Can't resolve 'nodemailer'`, a WARNING followed by "Compiled successfully" |
| `unresolved-dynamic-and-missing-export-real.txt` | `next build` 15.5.28 on a probe route with an unresolvable dynamic import and a named import the module does not export (compile phase only) | guard fails: `Module not found` and `Attempted import error` |
| `unresolved-static-error-real.txt` | `next build` 15.5.28 on a probe route with an unresolvable static import | guard fails: `Failed to compile` / `Module not found` (a hard error; the build step fails too, the guard gives the same verdict) |

If Next changes its output format and a fixture stops matching, regenerate it from a real build; do not edit it by hand.
