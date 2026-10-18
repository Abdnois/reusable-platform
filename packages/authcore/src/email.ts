const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

/**
 * Trim, lowercase, and validate an email address.
 * Throws on invalid input; returns the normalized form otherwise.
 */
export function normalizeEmail(email: string): string {
  if (typeof email !== "string") {
    throw new Error("Invalid email: must be a string.");
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) {
    throw new Error("Invalid email: empty or too long.");
  }
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error("Invalid email: malformed address.");
  }
  return normalized;
}
