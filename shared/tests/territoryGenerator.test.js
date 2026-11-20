import { describe, expect, it } from 'vitest';
import { ROCK_TYPES } from '../config/worldGeology.js';
import { generateContinent } from '../generators/continentGenerator.js';
import { generateTerritory, getWorldTileContext } from '../generators/territoryGenerator.js';

describe('Stage 1.3: Territory Generator', () => {
  it('generates identical 25x25 territories for the same tileSeed and context', () => {
    const continent = generateContinent('territory-det-seed', { size: 20 });
    const ctx = getWorldTileContext(continent, 10, 10);
    const tileSeed = continent.tiles[10 * 20 + 10].tileSeed;

    const a = generateTerritory(tileSeed, ctx);
    const b = generateTerritory(tileSeed, ctx);

    expect(a).toEqual(b);
    expect(a.size).toBe(25);
    expect(a.tiles).toHaveLength(625);
  });

  it('interpolates elevation from adjacent continent tiles (north > south)', () => {
    const makeTile = (elevation) => ({
      elevation,
      temperature: 0.5,
      moisture: 0.5,
      rockType: 'granite',
      biome: 'grassland',
      buildable: true,
      isObelisk: false,
    });

    const context = {
      center: makeTile(0.5),
      north: makeTile(0.8),
      south: makeTile(0.2),
      east: makeTile(0.5),
      west: makeTile(0.5),
    };

    const territory = generateTerritory('slope-test', context);
    const northAvg =
      territory.tiles.filter((t) => t.y === 0).reduce((s, t) => s + t.elevation, 0) / 25;
    const southAvg =
      territory.tiles.filter((t) => t.y === 24).reduce((s, t) => s + t.elevation, 0) / 25;

    expect(northAvg).toBeGreaterThan(southAvg);
  });

  it('guarantees at least 1 water tile while keeping the central 7x7 settlement zone dry', () => {
    const aridContext = {
      center: {
        elevation: 0.7,
        temperature: 0.9,
        moisture: 0.05,
        rockType: 'limestone',
        biome: 'desert',
        buildable: true,
        isObelisk: false,
      },
      north: { elevation: 0.7, temperature: 0.9, moisture: 0.05 },
      south: { elevation: 0.7, temperature: 0.9, moisture: 0.05 },
      east: { elevation: 0.7, temperature: 0.9, moisture: 0.05 },
      west: { elevation: 0.7, temperature: 0.9, moisture: 0.05 },
    };

    const territory = generateTerritory('arid-oasis-test', aridContext);
    expect(territory.waterCount).toBeGreaterThanOrEqual(1);

    const settlementTiles = territory.tiles.filter((t) => t.inSettlementZone);
    expect(settlementTiles).toHaveLength(49); // 7x7
    for (const tile of settlementTiles) {
      expect(tile.isWater).toBe(false);
    }
  });

  it('spawns only ore veins matching the parent tile rockType', () => {
    const shaleInfo = ROCK_TYPES.find((r) => r.id === 'shale');
    const allowedOres = new Set(shaleInfo.ores);

    const context = {
      center: {
        elevation: 0.52,
        temperature: 0.45,
        moisture: 0.55,
        rockType: 'shale',
        biome: 'temperate_forest',
        buildable: true,
        isObelisk: false,
      },
      north: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      south: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      east: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      west: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
    };

    const territory = generateTerritory('shale-ores', context);
    const oreNodes = territory.tiles
      .filter((t) => t.resourceNode?.type === 'ore_vein')
      .map((t) => t.resourceNode.resourceId);

    for (const ore of oreNodes) {
      expect(allowedOres.has(ore)).toBe(true);
    }
  });

  it('handles continent edge context safely and generates 25x25 in <5ms', () => {
    const continent = generateContinent('edge-perf-seed', { size: 30 });
    const cornerCtx = getWorldTileContext(continent, 0, 0);
    const tileSeed = continent.tiles[0].tileSeed;

    expect(() => getWorldTileContext(continent, -1, 0)).toThrow(RangeError);
    expect(() => generateTerritory(tileSeed, cornerCtx, { size: 0 })).toThrow(RangeError);

    const start = performance.now();
    const territory = generateTerritory(tileSeed, cornerCtx);
    const elapsedMs = performance.now() - start;

    expect(territory.tiles).toHaveLength(625);
    expect(elapsedMs).toBeLessThan(5);
  });
});
