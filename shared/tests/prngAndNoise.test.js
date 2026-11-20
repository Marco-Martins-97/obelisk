import { describe, expect, it } from 'vitest';
import { createPrng, hashCoords, hashSeed, randomInt } from '../generators/prng.js';
import { createNoise2D, fbm2D } from '../generators/noise.js';

describe('Stage 1.1: Deterministic PRNG & 2D Noise', () => {
  it('produces identical PRNG sequences for identical string or numeric seeds', () => {
    const rngA = createPrng('obelisk-alpha');
    const rngB = createPrng('obelisk-alpha');

    const seqA = Array.from({ length: 50 }, () => rngA());
    const seqB = Array.from({ length: 50 }, () => rngB());

    expect(seqA).toEqual(seqB);
    for (const val of seqA) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('derives distinct deterministic tileSeeds for adjacent coordinates', () => {
    const a = hashCoords('world-1', 10, 20);
    const b = hashCoords('world-1', 10, 20);
    const neighborX = hashCoords('world-1', 11, 20);
    const neighborY = hashCoords('world-1', 10, 21);
    const otherSalt = hashCoords('world-1', 10, 20, 1);

    expect(a).toBe(b);
    expect(a).not.toBe(neighborX);
    expect(a).not.toBe(neighborY);
    expect(a).not.toBe(otherSalt);
    expect(hashSeed('world-1')).not.toBe(hashSeed('world-2'));
  });

  it('keeps randomInt within inclusive bounds', () => {
    const rng = createPrng(42);
    for (let i = 0; i < 100; i += 1) {
      const val = randomInt(rng, 3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('generates identical, bounded fbm2D terrain fields within performance budget', () => {
    const noiseA = createNoise2D('continent-seed');
    const noiseB = createNoise2D('continent-seed');

    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) {
        const valA = fbm2D(noiseA, x, y);
        const valB = fbm2D(noiseB, x, y);
        expect(valA).toBe(valB);
        expect(valA).toBeGreaterThanOrEqual(0);
        expect(valA).toBeLessThanOrEqual(1);
      }
    }

    // Measure pure 100x100 (10,000 samples) generation speed without expect() overhead.
    const start = performance.now();
    let checksum = 0;
    for (let y = 0; y < 100; y += 1) {
      for (let x = 0; x < 100; x += 1) {
        checksum += fbm2D(noiseA, x, y);
      }
    }
    const elapsedMs = performance.now() - start;

    expect(checksum).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(50);
  });
});
