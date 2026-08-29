// Deterministic seeded PRNG. Same seed -> same sequence, always.
// mulberry32 is a small, well-known 32-bit generator; good enough for
// simulation jitter, not for cryptography.

/**
 * Hash an arbitrary seed (number or string) down to a 32-bit unsigned int.
 * Two different seed representations of "the same value" (e.g. 1 and "1")
 * are NOT guaranteed to collide; only exact-seed reuse is guaranteed stable.
 * @param {number|string} seed
 * @returns {number} 32-bit unsigned integer
 */
export function hashSeed(seed) {
  const str = String(seed);
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Combine a base seed with a frame index into one derived seed, so each
 * frame of a simulation draws from an independent-looking but fully
 * reproducible sub-stream.
 * @param {number|string} seed
 * @param {number} frame
 * @returns {number} 32-bit unsigned integer
 */
export function deriveFrameSeed(seed, frame) {
  const base = hashSeed(seed);
  // Mix the frame index in with another FNV-ish pass.
  let h = base ^ (frame >>> 0);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Create a deterministic pseudo-random number generator seeded with a
 * 32-bit unsigned integer.
 * @param {number} seed32 32-bit unsigned integer seed
 * @returns {() => number} function returning floats in [0, 1)
 */
export function mulberry32(seed32) {
  let a = seed32 >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Convenience: build a PRNG directly from a (seed, frame) pair.
 * @param {number|string} seed
 * @param {number} frame
 * @returns {() => number}
 */
export function frameRng(seed, frame) {
  return mulberry32(deriveFrameSeed(seed, frame));
}
