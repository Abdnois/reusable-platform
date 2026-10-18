import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "../email.ts";
import { generateSessionToken, hashSessionToken } from "../session-token.ts";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("normalizeEmail rejects missing @", () => {
  assert.throws(() => normalizeEmail("not-an-email"));
});

test("normalizeEmail rejects double @", () => {
  assert.throws(() => normalizeEmail("a@@b.com"));
});

test("normalizeEmail rejects empty and whitespace-only", () => {
  assert.throws(() => normalizeEmail(""));
  assert.throws(() => normalizeEmail("   "));
});

test("normalizeEmail rejects overlong input", () => {
  assert.throws(() => normalizeEmail("a".repeat(250) + "@x.com"));
});

test("generateSessionToken is 43-char base64url", () => {
  const token = generateSessionToken();
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("generateSessionToken produces unique tokens", () => {
  const seen = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
  assert.equal(seen.size, 100);
});

test("hashSessionToken is deterministic, 64 hex chars", () => {
  const a = hashSessionToken("token-abc");
  const b = hashSessionToken("token-abc");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("hashSessionToken differs for different tokens", () => {
  assert.notEqual(hashSessionToken("a"), hashSessionToken("b"));
});
