/**
 * Deterministic PRNG and coordinate hashing utilities.
 *
 * Strictly zero Math.random() — all randomness derives from explicit seeds
 * so /client and /server regenerate identical worlds and territories.
 */

/**
 * Computes a 32-bit unsigned FNV-1a hash from a string or number seed.
 *
 * @param {string | number} seed - Arbitrary world or tile seed.
 * @returns {number} Unsigned 32-bit integer hash.
 */
export function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return mix32(seed >>> 0);
  }

  const str = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash >>> 0);
}

/**
 * Murmur-style 32-bit bit-mixer to eliminate linear patterns in nearby seeds.
 *
 * @param {number} value - 32-bit integer input.
 * @returns {number} Well-distributed unsigned 32-bit integer.
 */
export function mix32(value) {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Derives a deterministic tileSeed from a master seed and (x, y) coordinates.
 * Used by the server to derive per-territory seeds without storing terrain.
 *
 * @param {string | number} masterSeed - Continent master seed.
 * @param {number} x - Grid X coordinate.
 * @param {number} y - Grid Y coordinate.
 * @param {number} [salt=0] - Optional domain separator for independent layers.
 * @returns {number} Unsigned 32-bit tileSeed.
 */
export function hashCoords(masterSeed, x, y, salt = 0) {
  let h = hashSeed(masterSeed);
  h = mix32(h ^ Math.imul(x | 0, 0x9e3779b1));
  h = mix32(h ^ Math.imul(y | 0, 0x85ebca77));
  h = mix32(h ^ Math.imul(salt | 0, 0xc2b2ae3d));
  return h >>> 0;
}

/**
 * Creates a fast, deterministic Mulberry32 PRNG returning floats in [0, 1).
 *
 * @param {string | number} seed - Seed value.
 * @returns {() => number} Stateful generator function.
 */
export function createPrng(seed) {
  let state = hashSeed(seed);

  return function nextFloat() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a deterministic integer in [min, max] (inclusive).
 *
 * @param {() => number} rng - Seeded PRNG function from createPrng().
 * @param {number} min - Minimum integer.
 * @param {number} max - Maximum integer.
 * @returns {number} Integer in [min, max].
 */
export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
