/**
 * src/modules/auth/validators.ts
 *
 * Zod schemas for every auth operation. These are the single source of
 * truth — used by both React Hook Form (client-side) and API route
 * handlers (server-side) so client/server validation can never drift
 * apart.
 *
 * Rules follow Indian market conventions:
 *  - Passwords: 8+ chars, at least one number, one uppercase — enforced
 *    but not overly complex (don't make users give up).
 *  - Email: lowercase normalised before storage.
 *  - Name: allows Unicode (covers Indian names in Devanagari, Tamil, etc.)
 */

import { z } from "zod";

/* -------------------------------------------------------------------------
 * Field-level reusables
 * ---------------------------------------------------------------------- */
const emailField = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .toLowerCase()
  .trim();

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number");

const nameField = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name is too long")
  .trim();

/* -------------------------------------------------------------------------
 * Signup
 * ---------------------------------------------------------------------- */
export const signupSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, { message: "You must accept the terms to continue" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/* -------------------------------------------------------------------------
 * Login
 * ---------------------------------------------------------------------- */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/* -------------------------------------------------------------------------
 * Email verification
 * ---------------------------------------------------------------------- */
export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/* -------------------------------------------------------------------------
 * Request password reset (step 1 — enter email)
 * ---------------------------------------------------------------------- */
export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/* -------------------------------------------------------------------------
 * Confirm password reset (step 2 — enter new password)
 * ---------------------------------------------------------------------- */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* -------------------------------------------------------------------------
 * Profile update (used in Module 4+ settings page)
 * ---------------------------------------------------------------------- */
export const updateProfileSchema = z.object({
  name: nameField,
  avatarUrl: z.string().url("Invalid URL").nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* -------------------------------------------------------------------------
 * Change password (from settings, when already authenticated)
 * ---------------------------------------------------------------------- */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordField,
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords don't match",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must differ from your current password",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
