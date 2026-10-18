import { createHash, randomBytes } from "node:crypto";

/** Generate a 256-bit session token, base64url-encoded (43 chars). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash a session token for storage. SHA-256 is sufficient because the
 * token is 256 bits of fresh randomness (not user-chosen, not low entropy). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
