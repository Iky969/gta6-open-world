// Seeded, deterministic randomness. Visual generation and gameplay rolls use
// separate streams so a crime roll can never shift the layout of the city or
// traffic: ?shot=...&seed=... reproduces the same frame every run.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Two independent streams from one seed: visual content (city, traffic, peds,
// effects) and gameplay outcomes (police rolls, ambushes, death). Keep the
// split stable: adding a visual draw must not change gameplay, and vice versa.
export function makeStreams(seed) {
  const visual = makeRng(seed);
  const gameplay = makeRng((seed ^ 0x9e3779b9) >>> 0);
  return { visual, gameplay };
}

export function randRange(rng, low, high) {
  return low + (high - low) * rng();
}

export function randInt(rng, low, high) {
  return Math.floor(randRange(rng, low, high + 1));
}

export function pick(rng, list) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function chance(rng, probability) {
  return rng() < probability;
}
