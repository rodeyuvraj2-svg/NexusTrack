export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_rate_limit: "You've requested too many emails. Please wait a minute before trying again.",
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Please verify your email before signing in.",
  network_error: "Unable to connect. Check your internet connection.",
  user_not_found: "No account found with this email address.",
  email_taken: "An account with this email already exists.",
  weak_password: "Password is too weak. Use at least 8 characters with a mix of letters and numbers.",
  session_expired: "Your session has expired. Please sign in again.",
};

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function getAuthErrorMessage(error: unknown): string {
  if (!error) return FALLBACK_MESSAGE;

  const message = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Network errors
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("offline")) {
    return AUTH_ERROR_MESSAGES.network_error;
  }

  // Supabase-specific error codes/messages
  if (lower.includes("email_rate_limit") || lower.includes("too many requests") || lower.includes("retry")) {
    return AUTH_ERROR_MESSAGES.email_rate_limit;
  }

  if (lower.includes("invalid_credentials") || lower.includes("invalid login credentials")) {
    return AUTH_ERROR_MESSAGES.invalid_credentials;
  }

  if (lower.includes("email_not_confirmed") || lower.includes("email not confirmed")) {
    return AUTH_ERROR_MESSAGES.email_not_confirmed;
  }

  if (lower.includes("user already registered") || lower.includes("email_taken")) {
    return AUTH_ERROR_MESSAGES.email_taken;
  }

  if (lower.includes("weak_password") || lower.includes("password is too weak")) {
    return AUTH_ERROR_MESSAGES.weak_password;
  }

  if (lower.includes("user_not_found") || lower.includes("no user found")) {
    return AUTH_ERROR_MESSAGES.user_not_found;
  }

  if (lower.includes("session_expired") || lower.includes("token expired")) {
    return AUTH_ERROR_MESSAGES.session_expired;
  }

  return FALLBACK_MESSAGE;
}

/** Parse retry_after_seconds from a Supabase rate-limit error. Returns null if not rate-limited. */
export function parseRetryAfter(error: unknown): number | null {
  if (!error) return null;

  // Supabase returns retry_after_seconds in the error object or message
  const err = error as any;
  if (typeof err.retry_after_seconds === "number") return err.retry_after_seconds;
  if (typeof err.retry_after_seconds === "string") return parseInt(err.retry_after_seconds, 10) || null;

  // Try to extract from error message
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
  const match = message.match(/retry.*?(\d+)/i);
  if (match) return parseInt(match[1], 10);

  return null;
}
