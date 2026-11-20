import { describe, expect, it } from 'vitest';
import { ELEVATION_BANDS, ROCK_TYPES } from '../config/worldGeology.js';
import { generateContinent } from '../generators/continentGenerator.js';

describe('Stage 1.2: Continent Generator', () => {
  it('generates byte-for-byte identical continents for the same seed', () => {
    const a = generateContinent('obelisk-world-1', { size: 40 });
    const b = generateContinent('obelisk-world-1', { size: 40 });

    expect(a).toEqual(b);
  });

  it('produces distinct continents for different seeds', () => {
    const a = generateContinent('seed-alpha', { size: 30 });
    const b = generateContinent('seed-beta', { size: 30 });

    expect(a.tiles[0].tileSeed).not.toBe(b.tiles[0].tileSeed);
    expect(a.tiles.map((t) => t.elevation)).not.toEqual(b.tiles.map((t) => t.elevation));
  });

  it('places exactly 1 Obelisk on a buildable non-ocean, non-mountain tile', () => {
    const continent = generateContinent('obelisk-placement-test', { size: 100 });
    const obelisks = continent.tiles.filter((t) => t.isObelisk);

    expect(obelisks).toHaveLength(1);
    const [obelisk] = obelisks;
    expect(obelisk.x).toBe(continent.obeliskCoords.x);
    expect(obelisk.y).toBe(continent.obeliskCoords.y);
    expect(obelisk.buildable).toBe(true);
    expect(obelisk.elevation).toBeGreaterThanOrEqual(ELEVATION_BANDS.SEA_LEVEL);
    expect(obelisk.elevation).toBeLessThan(ELEVATION_BANDS.MOUNTAIN_LEVEL);
    expect(obelisk.biome).not.toBe('ocean');
    expect(obelisk.biome).not.toBe('mountain');
  });

  it('enforces valid single-layer rock types and north-colder-than-south temperature gradient', () => {
    const size = 60;
    const continent = generateContinent('climate-check', { size });
    const validRocks = new Set(ROCK_TYPES.map((r) => r.id));

    let northTempSum = 0;
    let southTempSum = 0;

    for (const tile of continent.tiles) {
      expect(validRocks.has(tile.rockType)).toBe(true);
      if (tile.y === 0) northTempSum += tile.temperature;
      if (tile.y === size - 1) southTempSum += tile.temperature;
    }

    expect(northTempSum / size).toBeLessThan(southTempSum / size);
  });

  it('rejects invalid continent sizes and meets <50ms benchmark for 100x100', () => {
    expect(() => generateContinent('bad', { size: 0 })).toThrow(RangeError);
    expect(() => generateContinent('bad', { size: 10.5 })).toThrow(RangeError);

    const start = performance.now();
    const continent = generateContinent('perf-seed');
    const elapsedMs = performance.now() - start;

    expect(continent.size).toBe(100);
    expect(continent.tiles).toHaveLength(10000);
    expect(elapsedMs).toBeLessThan(50);
  });
});
