import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * Argon2id parameters per OWASP password storage cheat sheet:
 * memoryCost 19456 KiB (19 MiB), timeCost 2, parallelism 1.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function assertValidPassword(password: string): void {
  if (typeof password !== "string" || password.trim().length === 0) {
    throw new Error("Invalid password: must be a non-empty string.");
  }
}

/**
 * Hash a plaintext password with Argon2id and a fresh random salt.
 * Returns a PHC-formatted string, e.g. "$argon2id$v=19$m=19456,t=2,p=1$..."
 */
export async function hashPassword(password: string): Promise<string> {
  assertValidPassword(password);
  return argon2Hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 * Constant-time comparison is handled by the underlying library.
 * Malformed stored hashes return false rather than crashing.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  assertValidPassword(password);
  if (typeof storedHash !== "string" || storedHash.length === 0) {
    return false;
  }
  try {
    return await argon2Verify(storedHash, password);
  } catch {
    // Malformed or non-Argon2 hash: fail closed, never crash.
    return false;
  }
}
