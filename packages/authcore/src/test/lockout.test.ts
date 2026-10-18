import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCKOUT_THRESHOLD,
  LOCKOUT_BASE_MS,
  LOCKOUT_MAX_MS,
  nextLockDurationMs,
  isLocked,
} from "../lockout.ts";

test("no lock below threshold", () => {
  for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
    assert.equal(nextLockDurationMs(i), 0);
  }
});

test("first lock at threshold is base duration", () => {
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD), LOCKOUT_BASE_MS);
});

test("duration doubles per extra failure", () => {
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD + 1), LOCKOUT_BASE_MS * 2);
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD + 2), LOCKOUT_BASE_MS * 4);
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD + 3), LOCKOUT_BASE_MS * 8);
});

test("duration caps at 24 hours", () => {
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD + 60), LOCKOUT_MAX_MS);
  assert.equal(nextLockDurationMs(LOCKOUT_THRESHOLD + 1000), LOCKOUT_MAX_MS);
});

test("base duration is 15 minutes", () => {
  assert.equal(LOCKOUT_BASE_MS, 15 * 60 * 1000);
});

test("max duration is 24 hours", () => {
  assert.equal(LOCKOUT_MAX_MS, 24 * 60 * 60 * 1000);
});

test("isLocked: null lockedUntil means not locked", () => {
  assert.equal(isLocked(null, new Date()), false);
});

test("isLocked: future lockedUntil means locked", () => {
  const future = new Date(Date.now() + 60_000);
  assert.equal(isLocked(future, new Date()), true);
});

test("isLocked: past lockedUntil means not locked", () => {
  const past = new Date(Date.now() - 60_000);
  assert.equal(isLocked(past, new Date()), false);
});
