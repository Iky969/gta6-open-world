// Seeded, deterministic randomness. Every system draws from one of these so
// ?seed=... reproduces the same city, traffic and screenshot every run.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
