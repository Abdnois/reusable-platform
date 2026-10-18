/**
 * AuthCore public API surface — the ONLY module other packages may import.
 * Internals are reachable only through this barrel. CommerceCore must never
 * import from here until its Step 2 integration, and even then only through
 * explicitly exported, stable symbols.
 */

/** Name of the PostgreSQL schema this core exclusively owns. */
export const AUTHCORE_SCHEMA_NAME = "authcore" as const;

/** Name of this core's Drizzle migration journal table (NOT the toolkit default). */
export const AUTHCORE_JOURNAL_TABLE = "authcore_migrations" as const;

/** Shared Drizzle metadata schema where each core's journal table lives. */
export const DRIZZLE_METADATA_SCHEMA = "drizzle" as const;

export { users, credentials, sessions } from "./db/schema.ts";
export { hashPassword, verifyPassword } from "./password.ts";
export { normalizeEmail } from "./email.ts";
export { generateSessionToken, hashSessionToken } from "./session-token.ts";
export {
  registerUser,
  loginUser,
  createSession,
  verifySession,
  revokeSession,
  SESSION_TTL_MS,
  EmailAlreadyRegisteredError,
} from "./registration.ts";
export type {
  RegisterInput,
  RegisteredUser,
  SessionInfo,
  SessionUser,
} from "./registration.ts";
