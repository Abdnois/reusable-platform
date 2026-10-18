import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  EmailAlreadyRegisteredError,
  SESSION_TTL_MS,
  createSession,
  hashSessionToken,
  loginAttempts,
  loginUser,
  registerUser,
  revokeSession,
  sessions,
  verifySession,
} from "../../index.ts";

const dbUrl = process.env["AUTHCORE_E2E_DB_URL"];
if (dbUrl === undefined || dbUrl === "") {
  throw new Error(
    "AUTHCORE_E2E_DB_URL is not set. The integration suite must be launched by `pnpm --filter @platform/authcore test:db`, which boots the ephemeral scratch cluster.",
  );
}

const client = new Client({ connectionString: dbUrl });
await client.connect();
const db = drizzle(client);

after(async () => {
  await client.end();
});

let seq = 0;
const uniqueEmail = () => `user${String(++seq)}@example.com`;
const PASSWORD = "correct-horse-battery-staple";
const WRONG_PASSWORD = "definitely-not-the-password";

test("registerUser normalizes email and returns the created user", async () => {
  const email = uniqueEmail();
  const user = await registerUser(db, {
    email: `  ${email.toUpperCase()} `,
    password: PASSWORD,
  });
  assert.equal(user.email, email);
  assert.ok(typeof user.id === "string" && user.id.length > 0);
  assert.ok(user.createdAt instanceof Date);
});

test("registerUser rejects duplicate email with EmailAlreadyRegisteredError", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  await assert.rejects(
    registerUser(db, {
      email: `  ${email.toUpperCase()} `,
      password: "other-password",
    }),
    EmailAlreadyRegisteredError,
  );
});

test("loginUser returns a session for correct credentials", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  const session = await loginUser(db, { email, password: PASSWORD });
  assert.ok(session !== null);
  assert.ok(typeof session.token === "string" && session.token.length >= 32);
  const expectedExpiry = Date.now() + SESSION_TTL_MS;
  const drift = Math.abs(session.expiresAt.getTime() - expectedExpiry);
  assert.ok(drift < 60_000);
});

test("verifySession resolves the session user and rejects garbage tokens", async () => {
  const email = uniqueEmail();
  const registered = await registerUser(db, { email, password: PASSWORD });
  const session = await loginUser(db, { email, password: PASSWORD });
  assert.ok(session !== null);
  const user = await verifySession(db, session.token);
  assert.deepEqual(user, { userId: registered.id, email });
  assert.equal(await verifySession(db, "not-a-real-token"), null);
  assert.equal(await verifySession(db, ""), null);
});

test("revokeSession invalidates the session exactly once", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  const session = await loginUser(db, { email, password: PASSWORD });
  assert.ok(session !== null);
  assert.equal(await revokeSession(db, session.token), true);
  assert.equal(await verifySession(db, session.token), null);
  assert.equal(await revokeSession(db, session.token), false);
});

test("sessions table stores only the SHA-256 hash, never the raw token", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  const session = await loginUser(db, { email, password: PASSWORD });
  assert.ok(session !== null);
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(session.token)));
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0]!.tokenHash, session.token);
});

test("wrong password: login fails and the attempt counter increments", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  assert.equal(await loginUser(db, { email, password: WRONG_PASSWORD }), null);
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.failedAttempts, 1);
  assert.equal(rows[0]!.lockedUntil, null);
});

test("lockout: 5 consecutive failures lock the account, even with the correct password", async () => {
  const email = uniqueEmail();
  await registerUser(db, { email, password: PASSWORD });
  for (let i = 0; i < 5; i++) {
    assert.equal(await loginUser(db, { email, password: WRONG_PASSWORD }), null);
  }
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email));
  assert.equal(rows[0]!.failedAttempts, 5);
  assert.ok(
    rows[0]!.lockedUntil !== null && rows[0]!.lockedUntil.getTime() > Date.now(),
  );
  assert.equal(await loginUser(db, { email, password: PASSWORD }), null);
});

test("lockout expiry and successful login reset the counter row", async () => {
  const email = uniqueEmail();
  const registered = await registerUser(db, { email, password: PASSWORD });
  for (let i = 0; i < 5; i++) {
    await loginUser(db, { email, password: WRONG_PASSWORD });
  }
  // Simulate the lockout window passing.
  await db
    .update(loginAttempts)
    .set({ lockedUntil: new Date(Date.now() - 1_000) })
    .where(eq(loginAttempts.email, email));
  const session = await loginUser(db, { email, password: PASSWORD });
  assert.ok(session !== null);
  assert.equal(session.userId, registered.id);
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email));
  assert.equal(rows.length, 0);
});

test("unknown email: login fails without recording an attempt", async () => {
  const email = uniqueEmail();
  assert.equal(await loginUser(db, { email, password: WRONG_PASSWORD }), null);
  const rows = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.email, email));
  assert.equal(rows.length, 0);
});

test("expired sessions are rejected by verifySession", async () => {
  const email = uniqueEmail();
  const registered = await registerUser(db, { email, password: PASSWORD });
  const session = await createSession(db, registered.id);
  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(eq(sessions.tokenHash, hashSessionToken(session.token)));
  assert.equal(await verifySession(db, session.token), null);
});
