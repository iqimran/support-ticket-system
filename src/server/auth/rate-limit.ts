const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; windowStart: number };

/**
 * In-memory, single-process login throttle keyed by the submitted phone
 * number (not IP — a shared office network would otherwise rate-limit every
 * employee together). Deliberately simple: this is a small internal tool
 * with a handful of staff accounts, not a public signup form.
 *
 * Known limitation (see SECURITY.md): this Map lives in one server
 * process's memory. Behind a load balancer with multiple instances, each
 * instance counts independently, so the effective limit is
 * MAX_ATTEMPTS × instance count. A restart also clears every counter. If
 * this app is ever deployed with more than one instance, replace this with
 * a shared store (e.g. Redis) — the call sites in features/auth/actions.ts
 * wouldn't need to change.
 */
const attempts = new Map<string, Bucket>();

function getBucket(key: string): Bucket | undefined {
  const bucket = attempts.get(key);
  if (bucket && Date.now() - bucket.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return undefined;
  }
  return bucket;
}

export function isLoginRateLimited(key: string): boolean {
  const bucket = getBucket(key);
  return bucket !== undefined && bucket.count >= MAX_ATTEMPTS;
}

export function recordFailedLoginAttempt(key: string): void {
  const bucket = getBucket(key);
  if (!bucket) {
    attempts.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  bucket.count++;
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
