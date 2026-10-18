import { and, eq, gt, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { credentials, loginAttempts, sessions, users } from "./db/schema.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { normalizeEmail } from "./email.ts";
import { generateSessionToken, hashSessionToken } from "./session-token.ts";
import { isLocked, nextLockDurationMs } from "./lockout.ts";

/** Session lifetime: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

/** Dummy Argon2id hash used to equalize timing when the email is unknown. */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface RegisterInput {
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface SessionInfo {
  token: string;
  userId: string;
  expiresAt: Date;
}

export interface SessionUser {
  userId: string;
  email: string;
}

/**
 * Detect a Postgres unique-violation (SQLSTATE 23505) anywhere in an error's
 * cause chain. Drizzle's node-postgres driver wraps driver-level failures in
 * DrizzleQueryError with the original pg error attached as `cause`, so the
 * SQLSTATE may sit one or more levels below the thrown error. Walking the
 * chain keeps this correct for both mocked errors (code on the error itself)
 * and real database errors (code on the underlying cause).
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const code = (current as { code?: unknown }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Register a new user: normalize email, hash password, insert user + credential
 * atomically. Throws EmailAlreadyRegisteredError on duplicate email.
 */
export async function registerUser(
  db: NodePgDatabase,
  input: RegisterInput,
): Promise<RegisteredUser> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.transaction(async (tx) => {
      const rows = await tx.insert(users).values({ email }).returning();
      const inserted = rows[0]!;
      await tx.insert(credentials).values({ userId: inserted.id, passwordHash });
      return inserted;
    });
    return { id: user.id, email: user.email, createdAt: user.createdAt };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailAlreadyRegisteredError(email);
    }
    throw error;
  }
}

/**
 * Record a failed login attempt: increment the counter and apply the
 * exponential-backoff lockout window when the threshold is crossed.
 */
async function recordLoginFailure(
  db: NodePgDatabase,
  email: string,
): Promise<void> {
  const existing = await db
    .select({ failedAttempts: loginAttempts.failedAttempts })
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email))
    .limit(1);
  const newCount = (existing[0]?.failedAttempts ?? 0) + 1;
  const duration = nextLockDurationMs(newCount);
  const lockedUntil = duration > 0 ? new Date(Date.now() + duration) : null;
  const now = new Date();
  await db
    .insert(loginAttempts)
    .values({ email, failedAttempts: newCount, lockedUntil, updatedAt: now })
    .onConflictDoUpdate({
      target: loginAttempts.email,
      set: { failedAttempts: newCount, lockedUntil, updatedAt: now },
    });
}

/**
 * Log in: enforce lockout, verify credentials, create a session.
 * Returns null on any failure (locked out, unknown email, wrong password,
 * bad input). Failed attempts increment the lockout counter; success
 * resets it. Timing-equalization on unknown email is preserved.
 */
export async function loginUser(
  db: NodePgDatabase,
  input: RegisterInput,
): Promise<SessionInfo | null> {
  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch {
    return null;
  }
  const attemptRows = await db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email))
    .limit(1);
  if (isLocked(attemptRows[0]?.lockedUntil ?? null, new Date())) {
    return null;
  }
  const found = await db
    .select({ id: users.id, passwordHash: credentials.passwordHash })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  const row = found[0];
  if (!row) {
    await verifyPassword(DUMMY_HASH, input.password).catch(() => false);
    return null;
  }
  const ok = await verifyPassword(row.passwordHash, input.password).catch(
    () => false,
  );
  if (!ok) {
    await recordLoginFailure(db, email);
    return null;
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
  return createSession(db, row.id);
}

/** Create a new session for a user. Raw token is returned once, never stored. */
export async function createSession(
  db: NodePgDatabase,
  userId: string,
): Promise<SessionInfo> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db
    .insert(sessions)
    .values({ userId, tokenHash: hashSessionToken(token), expiresAt });
  return { token, userId, expiresAt };
}

/**
 * Verify a session token: must exist, be unrevoked, and be unexpired.
 * Returns the session user, or null on any failure.
 */
export async function verifySession(
  db: NodePgDatabase,
  token: string,
): Promise<SessionUser | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const rows = await db
    .select({ userId: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? { userId: row.userId, email: row.email } : null;
}

/** Revoke a session token. Returns true if a live session was revoked. */
export async function revokeSession(
  db: NodePgDatabase,
  token: string,
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        isNull(sessions.revokedAt),
      ),
    )
    .returning({ id: sessions.id });
  return revoked.length > 0;
}
