export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export function random(seed: string): () => number {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const boundedBasket = (rng: () => number): number => {
  const normal =
    Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) *
    Math.cos(2 * Math.PI * rng());
  return Math.min(3, Math.max(0.28, Math.exp(normal * 0.45 - 0.45 ** 2 / 2)));
};
export function weightedIndex(weights: number[], rng: () => number): number {
  let target = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i];
    if (target < 0) return i;
  }
  return Math.max(0, weights.length - 1);
}
