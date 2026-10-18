/** Consecutive failures before a lockout is applied. */
export const LOCKOUT_THRESHOLD = 5;

/** Base lockout duration for the first lockout (15 minutes). */
export const LOCKOUT_BASE_MS = 15 * 60 * 1000;

/** Maximum lockout duration (24 hours). */
export const LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Lockout duration after the Nth consecutive failure.
 * Returns 0 (no lock) while failedAttempts is below the threshold.
 * At and beyond the threshold, duration doubles per extra failure,
 * capped at LOCKOUT_MAX_MS.
 */
export function nextLockDurationMs(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_THRESHOLD) return 0;
  const exponent = failedAttempts - LOCKOUT_THRESHOLD;
  return Math.min(LOCKOUT_BASE_MS * 2 ** exponent, LOCKOUT_MAX_MS);
}

/** True if the account is locked at the given time. */
export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
