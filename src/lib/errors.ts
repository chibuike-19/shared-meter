import { ZodError } from "zod";

/**
 * An error whose message is safe and intended to be shown to a non-technical
 * user (e.g. "Your last reading was 1030…"). Everything else is treated as a
 * technical error and replaced with a friendly, generic message.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/**
 * Turn any thrown value into a message safe to show residents. Zod issues and
 * UserError pass through; common auth/database errors are mapped to plain
 * language; anything else falls back to a generic line so raw DB/Supabase
 * jargon is never shown.
 */
export function friendlyError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues.map((i) => i.message).join(" ");
  }
  if (err instanceof UserError) return err.message;

  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = msg.toLowerCase();

  if (/already been registered|already exists|duplicate.*email/.test(m)) {
    return "An account with that email already exists.";
  }
  if (/duplicate key|unique constraint/.test(m)) {
    if (/phone/.test(m)) return "That phone number is already linked to another resident.";
    if (/house/.test(m)) return "That house label is already taken.";
    return "That value is already in use by another resident.";
  }
  if (/password/.test(m) && /(least|short|weak|characters|6)/.test(m)) {
    return "Please choose a stronger password (at least 8 characters).";
  }
  if (/invalid login credentials|invalid credentials/.test(m)) {
    return "Wrong email or password.";
  }
  if (/email.*not.*confirm/.test(m)) {
    return "Your email isn't confirmed yet — ask your admin.";
  }
  if (/user not found|no user|email.*not found/.test(m)) {
    return "We couldn't find an account with that email.";
  }
  if (/rate limit|too many/.test(m)) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (/jwt|token|permission|row-level security|not authoriz|unauthoriz|pgrst/.test(m)) {
    return "Your session may have expired, or you don't have permission. Please sign in again.";
  }
  if (/network|fetch failed|failed to fetch|timeout|econn|dns/.test(m)) {
    return "Network problem. Please check your connection and try again.";
  }

  return "Something went wrong. Please try again, or contact your admin.";
}
