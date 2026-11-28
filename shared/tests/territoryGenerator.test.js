import { describe, expect, it } from 'vitest';
import { ELEVATION_BANDS, ROCK_TYPES } from '../config/worldGeology.js';
import { generateContinent } from '../generators/continentGenerator.js';
import {
  TERRITORY_FOREST_THRESHOLD,
  generateTerritory,
  getWorldTileContext,
} from '../generators/territoryGenerator.js';

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

  it('guarantees at least 1 water tile and 1 forest tile while keeping the central 7x7 settlement zone clear', () => {
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

    const forestTiles = territory.tiles.filter(
      (t) => !t.isWater && !t.inSettlementZone && t.buildable && t.forestDensity >= TERRITORY_FOREST_THRESHOLD,
    );
    expect(forestTiles.length).toBeGreaterThanOrEqual(1);

    const ringForestTiles = forestTiles.filter(
      (t) => Math.max(Math.abs(t.x - 12), Math.abs(t.y - 12)) === 4,
    );
    expect(ringForestTiles.length).toBeGreaterThanOrEqual(1);

    const settlementTiles = territory.tiles.filter((t) => t.inSettlementZone);
    expect(settlementTiles).toHaveLength(49); // 7x7
    for (const tile of settlementTiles) {
      expect(tile.isWater).toBe(false);
      expect(tile.forestDensity).toBe(0);
    }
  });

  it('generates one ore layer per rockType ore with smaller footprints for rarer ores', () => {
    const marbleInfo = ROCK_TYPES.find((r) => r.id === 'marble'); // flux (common) & gems (very_rare)
    const context = {
      center: {
        elevation: 0.52,
        temperature: 0.45,
        moisture: 0.55,
        rockType: 'marble',
        biome: 'temperate_forest',
        buildable: true,
        isObelisk: false,
      },
      north: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      south: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      east: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
      west: { elevation: 0.52, temperature: 0.45, moisture: 0.55 },
    };

    const territory = generateTerritory('marble-rarity-test', context);
    expect(territory.availableOres).toEqual(marbleInfo.ores);

    let fluxRichTiles = 0;
    let gemsRichTiles = 0;

    for (const tile of territory.tiles) {
      expect(tile).not.toHaveProperty('resourceNode');
      for (const oreId of marbleInfo.ores) {
        expect(tile.ores[oreId]).toBeGreaterThanOrEqual(0);
        expect(tile.ores[oreId]).toBeLessThanOrEqual(1);
      }
      if (tile.ores.flux >= 0.45) fluxRichTiles += 1;
      if (tile.ores.gems >= 0.45) gemsRichTiles += 1;
    }

    // Very rare gems should cover fewer tiles than common flux.
    expect(gemsRichTiles).toBeGreaterThan(0);
    expect(gemsRichTiles).toBeLessThan(fluxRichTiles);
  });

  it('derives territory moisture from distance to water tiles', () => {
    const context = {
      center: {
        elevation: 0.65,
        temperature: 0.7,
        moisture: 0.05,
        rockType: 'limestone',
        biome: 'desert',
        buildable: true,
        isObelisk: false,
      },
      north: { elevation: 0.65, temperature: 0.7, moisture: 0.05 },
      south: { elevation: 0.65, temperature: 0.7, moisture: 0.05 },
      east: { elevation: 0.65, temperature: 0.7, moisture: 0.05 },
      west: { elevation: 0.65, temperature: 0.7, moisture: 0.05 },
    };

    const territory = generateTerritory('water-moisture-test', context);
    const waterTiles = territory.tiles.filter((t) => t.isWater);
    const dryTiles = territory.tiles.filter((t) => !t.isWater);

    const avgWaterMoist = waterTiles.reduce((s, t) => s + t.moisture, 0) / waterTiles.length;
    const avgDryMoist = dryTiles.reduce((s, t) => s + t.moisture, 0) / dryTiles.length;

    expect(avgWaterMoist).toBe(1);
    expect(avgDryMoist).toBeLessThan(avgWaterMoist);
  });

  it('handles continent edge context safely and generates 25x25 in <5ms', () => {
    const continent = generateContinent('edge-perf-seed', { size: 30 });
    const cornerCtx = getWorldTileContext(continent, 0, 0);
    const tileSeed = continent.tiles[0].tileSeed;

    expect(() => getWorldTileContext(continent, -1, 0)).toThrow(RangeError);
    expect(() => generateTerritory(tileSeed, cornerCtx, { size: 0 })).toThrow(RangeError);

    // Sample the fastest of 3 consecutive runs so parallel worker GC/reschedules do not hide steady speed.
    let bestMs = Infinity;
    let territory = null;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      territory = generateTerritory(tileSeed, cornerCtx);
      bestMs = Math.min(bestMs, performance.now() - start);
    }

    expect(territory.tiles).toHaveLength(625);
    expect(bestMs).toBeLessThan(5);
  });

  it('prevents dry coastal land sub-tiles from dipping below SEA_LEVEL and becoming unbuildable', () => {
    const coastalContext = {
      center: {
        elevation: 0.39,
        temperature: 0.55,
        moisture: 0.4,
        rockType: 'granite',
        biome: 'grassland',
        buildable: true,
        isObelisk: false,
      },
      north: { elevation: 0.12, temperature: 0.5, moisture: 0.8 },
      south: { elevation: 0.48, temperature: 0.58, moisture: 0.4 },
      east: { elevation: 0.45, temperature: 0.55, moisture: 0.4 },
      west: { elevation: 0.15, temperature: 0.5, moisture: 0.8 },
    };

    const territory = generateTerritory('coastal-buildable-fix', coastalContext);
    const dryLowlandTiles = territory.tiles.filter(
      (t) => !t.isWater && t.elevation < ELEVATION_BANDS.MOUNTAIN_LEVEL,
    );

    expect(dryLowlandTiles.length).toBeGreaterThan(0);
    for (const tile of dryLowlandTiles) {
      expect(tile.elevation).toBeGreaterThanOrEqual(ELEVATION_BANDS.SEA_LEVEL);
      expect(tile.buildable).toBe(true);
    }
  });
});
