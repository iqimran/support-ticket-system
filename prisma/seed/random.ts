// A tiny seeded PRNG (mulberry32) — not Math.random() — so the whole seed
// script produces byte-for-byte the same customers, tickets, dates, and
// text every time it's run against a fresh database. This is what makes
// "npm run prisma:reseed" reproducible rather than merely "realistic".

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max], inclusive on both ends. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randInt(rng, 0, items.length - 1)];
  if (item === undefined) throw new Error("pick() called with an empty array");
  return item;
}

/** Weighted pick — e.g. pickWeighted(rng, [["A", 3], ["B", 1]]) picks "A" three times as often as "B". */
export function pickWeighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [item, weight] of items) {
    if (roll < weight) return item;
    roll -= weight;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error("pickWeighted() called with an empty array");
  return last[0];
}

/** true with the given probability (0-1). */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

export function randomDateBetween(rng: Rng, start: Date, end: Date): Date {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(Math.round(t));
}

/** A date `hoursLater` to `hoursLater + spreadHours` after `base` — for building a plausible event timeline off a ticket's createdAt. */
export function laterBy(rng: Rng, base: Date, hoursLater: number, spreadHours: number): Date {
  return new Date(base.getTime() + (hoursLater + rng() * spreadHours) * 60 * 60 * 1000);
}

/** Picks `count` distinct items from `items` (count must be <= items.length). */
export function pickDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const result: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = randInt(rng, 0, pool.length - 1);
    result.push(pool[index]!);
    pool.splice(index, 1);
  }
  return result;
}
