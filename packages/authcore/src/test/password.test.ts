import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../password.js";

test("hash -> verify roundtrip returns true", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword(hash, "correct horse battery staple"), true);
});

test("wrong password returns false", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword(hash, "Tr0ub4dor&3"), false);
});

test("same password produces different hashes (unique salts)", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a, b);
});

test("hash string is Argon2id PHC format", async () => {
  const hash = await hashPassword("some-password");
  assert.ok(hash.startsWith("$argon2id$"));
});

test("empty password throws on hash", async () => {
  await assert.rejects(hashPassword(""));
});

test("whitespace-only password throws on hash", async () => {
  await assert.rejects(hashPassword("   "));
});

test("empty password throws on verify", async () => {
  const hash = await hashPassword("some-password");
  await assert.rejects(verifyPassword(hash, ""));
});

test("corrupted hash returns false, does not crash", async () => {
  const result = await verifyPassword("not-a-real-hash", "some-password");
  assert.equal(result, false);
});

test("empty stored hash returns false", async () => {
  assert.equal(await verifyPassword("", "some-password"), false);
});
