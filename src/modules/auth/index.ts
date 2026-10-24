/**
 * src/modules/auth/index.ts
 *
 * Public API of the auth module. Only what's needed by other modules
 * or by app/ routes should be exported here — internal implementation
 * details (repository queries, raw token functions) stay unexported.
 */

// Types consumed by other modules (workspace, billing, etc.)
export type { AuthUser, WorkspaceUser, SessionPayload } from "./types";

// Validators reused by both API routes and client-side RHF forms
export {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "./validators";
export type {
  SignupInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  ChangePasswordInput,
} from "./validators";

// Session helpers used by middleware and API routes
export { getCurrentSession, createSessionToken, verifySessionToken } from "./session";
