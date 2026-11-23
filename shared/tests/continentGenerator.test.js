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

  it('enforces all single-layer rock types and north-colder-than-south temperature gradient', () => {
    const size = 100;
    const continent = generateContinent('climate-check', { size });
    const validRocks = new Set(ROCK_TYPES.map((r) => r.id));
    const observedRocks = new Set();

    let northTempSum = 0;
    let southTempSum = 0;

    for (const tile of continent.tiles) {
      expect(validRocks.has(tile.rockType)).toBe(true);
      observedRocks.add(tile.rockType);
      if (tile.y === 0) northTempSum += tile.temperature;
      if (tile.y === size - 1) southTempSum += tile.temperature;
    }

    expect(observedRocks.size).toBe(ROCK_TYPES.length);
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

  it('exercises wide [0, 1] range producing deep oceans (< 0.25) and mountains (> 0.78)', () => {
    const continent = generateContinent('range-check-alpha', { size: 100 });
    let minElev = 1;
    let maxElev = 0;
    let minMoist = 1;
    let maxMoist = 0;
    let minTemp = 1;
    let maxTemp = 0;

    for (const tile of continent.tiles) {
      if (tile.elevation < minElev) minElev = tile.elevation;
      if (tile.elevation > maxElev) maxElev = tile.elevation;
      if (tile.moisture < minMoist) minMoist = tile.moisture;
      if (tile.moisture > maxMoist) maxMoist = tile.moisture;
      if (tile.temperature < minTemp) minTemp = tile.temperature;
      if (tile.temperature > maxTemp) maxTemp = tile.temperature;
    }

    expect(minElev).toBeLessThan(0.25);
    expect(maxElev).toBeGreaterThan(ELEVATION_BANDS.MOUNTAIN_LEVEL);
    expect(minMoist).toBeLessThan(0.25);
    expect(maxMoist).toBeGreaterThan(0.75);
    expect(minTemp).toBeLessThan(0.25);
    expect(maxTemp).toBeGreaterThan(0.75);
  });
});
