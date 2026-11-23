import { createPrng } from './prng.js';

/**
 * Zero-dependency seeded 2D Gradient (Perlin) noise and fBm utilities.
 * Produces smooth, deterministic terrain fields across /client and /server.
 */

const GRADIENTS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Quintic fade curve (6t^5 - 15t^4 + 10t^3) for C2-continuous interpolation.
 *
 * @param {number} t - Fractional coordinate in [0, 1].
 * @returns {number} Smoothed interpolation weight.
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Linear interpolation between a and b.
 *
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Weight in [0, 1].
 * @returns {number} Interpolated value.
 */
function lerp(a, b, t) {
  return a + t * (b - a);
}

/**
 * Builds a seeded 2D gradient noise sampler returning values in roughly [-1, 1].
 *
 * @param {string | number} seed - Seed for the permutation table.
 * @returns {(x: number, y: number) => number} 2D noise function.
 */
export function createNoise2D(seed) {
  const rng = createPrng(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);

  for (let i = 0; i < 256; i += 1) {
    base[i] = i;
  }

  // Fisher-Yates shuffle driven solely by seeded PRNG.
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }

  for (let i = 0; i < 512; i += 1) {
    perm[i] = base[i & 255];
  }

  return function noise2D(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const g00 = GRADIENTS[perm[perm[xi] + yi] & 7];
    const g10 = GRADIENTS[perm[perm[xi + 1] + yi] & 7];
    const g01 = GRADIENTS[perm[perm[xi] + yi + 1] & 7];
    const g11 = GRADIENTS[perm[perm[xi + 1] + yi + 1] & 7];

    const n00 = g00[0] * xf + g00[1] * yf;
    const n10 = g10[0] * (xf - 1) + g10[1] * yf;
    const n01 = g01[0] * xf + g01[1] * (yf - 1);
    const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);

    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  };
}

/**
 * Multi-octave Fractal Brownian Motion (fBm) normalized to [0, 1].
 *
 * @param {(x: number, y: number) => number} noise2D - Base 2D noise sampler.
 * @param {number} x - World or local X coordinate.
 * @param {number} y - World or local Y coordinate.
 * @param {object} [options] - fBm tuning parameters.
 * @param {number} [options.scale=0.04] - Base coordinate frequency.
 * @param {number} [options.octaves=4] - Number of layered octaves.
 * @param {number} [options.lacunarity=2] - Frequency multiplier per octave.
 * @param {number} [options.persistence=0.5] - Amplitude multiplier per octave.
 * @returns {number} Normalized value clamped to [0, 1].
 */
export function fbm2D(
  noise2D,
  x,
  y,
  { scale = 0.04, octaves = 4, lacunarity = 2, persistence = 0.5 } = {},
) {
  let total = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i += 1) {
    total += noise2D(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Expand multi-octave Perlin contrast (~1.75x) before mapping [-1, 1] -> [0, 1]
  // so Elevation, Moisture, and Temperature reach the full [0.0, 1.0] dynamic range.
  const scaled = (total / maxAmplitude) * 1.75;
  const normalized = (scaled + 1) * 0.5;
  return Math.max(0, Math.min(1, normalized));
}
