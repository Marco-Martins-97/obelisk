import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  DAYS_PER_MONTH,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  HOURS_PER_INGAME_DAY,
  PANNABLE_ORE_NUGGETS,
  REAL_MS_PER_INGAME_DAY,
  REAL_MS_PER_INGAME_HOUR,
  RECIPES,
  RESOURCES,
  SIZE_CLASSES,
  STARTER_INVENTORY,
  STARTER_VILLAGE_POOLS,
  TERRITORY_TILE_DISTANCE_KM,
  UNITS,
  WATER_BOWLS_PER_JAR,
  calculateBuildTimestamps,
  calculateDailySurvival,
  calculateMaxPopulation,
  calculatePopUsed,
  calculateStorageUsed,
  calculateTileDistanceKm,
  calculateUnitActionTimestamps,
  classifyTerritoryTile,
  createBuilding,
  createInitialTerritoryFog,
  createPrng,
  createRecipe,
  createResource,
  createUnit,
  getCalendarState,
  revealBox3x3,
  rollTileActionYield,
  unlockContinentRingIfTerritoryComplete,
} from '../index.js';

describe('Stone Age templates, starter pools & linear sizeClass', () => {
  it('enforces linear sizeClass 1..5 and computes exact 50/100 starter storage bulk', () => {
    expect(SIZE_CLASSES).toEqual({
      1: 'tiny',
      2: 'small',
      3: 'medium',
      4: 'big',
      5: 'large',
    });

    expect(RESOURCES.straw.sizeClass).toBe(2);
    expect(RESOURCES.cooked_fish.edible).toBe(true);
    expect(calculateStorageUsed(STARTER_INVENTORY)).toBe(50);
    expect(STARTER_VILLAGE_POOLS.storageCapacity).toBe(100);
    expect(STARTER_VILLAGE_POOLS.water).toBe(5);
    expect(STARTER_VILLAGE_POOLS.waterCapacity).toBe(10);
  });

  it('excludes flux and coal from pannable river/lake ore nuggets', () => {
    expect(PANNABLE_ORE_NUGGETS).toContain('copper_nugget');
    expect(PANNABLE_ORE_NUGGETS).not.toContain('flux_nugget');
    expect(PANNABLE_ORE_NUGGETS).not.toContain('coal_nugget');
  });

  it('balances Firepit + House starter costs cleanly against starter inventory', () => {
    // 10 sticks, 10 pelts, 5 small_stones can pay Firepit + stick/pelt share of House (needs 4 straw).
    const combinedSticks = BUILDINGS.firepit.cost.sticks + BUILDINGS.house.cost.sticks;
    expect(combinedSticks).toBeLessThanOrEqual(STARTER_INVENTORY.sticks);
    expect(BUILDINGS.firepit.cost.small_stones).toBeLessThanOrEqual(STARTER_INVENTORY.small_stones);
    expect(BUILDINGS.house.cost.pelts).toBeLessThanOrEqual(STARTER_INVENTORY.pelts);
    expect(BUILDINGS.house.cost.straw).toBe(4);
    expect(BUILDINGS.main.prePlaced).toBe(true);
    expect(RECIPES.smelt_copper_ingot.inputs).toEqual({ copper_nugget: 10, charcoal: 2 });
    expect(RECIPES.smelt_copper_ingot.unlocksAge).toBe('copper');
  });

  it('validates factory inputs and rejects out-of-range configurations', () => {
    expect(() => createResource({ id: 'bad', name: 'Bad', sizeClass: 6 })).toThrow(RangeError);
    expect(() => createUnit({ id: 'bad', name: 'Bad', speedKmPerHour: 0 })).toThrow(RangeError);
    expect(() => createBuilding({ id: 'bad', name: 'Bad', maxLevel: 0 })).toThrow(RangeError);
    expect(() =>
      createRecipe({ id: 'bad', name: 'Bad', buildingId: 'kiln', inputs: {}, outputs: { a: 1 }, craftTimeHours: 1 }),
    ).toThrow(Error);
  });
});

describe('6x calendar, continuous day/night cycle & popUsed survival', () => {
  it('computes 6x accelerated calendar across days, lunar months, seasons, and years', () => {
    const start = getCalendarState(0);
    expect(start).toMatchObject({
      year: 1,
      season: 'spring',
      monthOfSeason: 1,
      dayOfMonth: 1,
      dayNumber: 1,
      hourOfDay: 0,
      isDaylight: false,
      daylightPhase: 'night',
    });

    const noonDay1 = getCalendarState(12 * REAL_MS_PER_INGAME_HOUR);
    expect(noonDay1.hourOfDay).toBe(12);
    expect(noonDay1.isDaylight).toBe(true);
    expect(noonDay1.daylightPhase).toBe('day');

    const month2 = getCalendarState(DAYS_PER_MONTH * REAL_MS_PER_INGAME_DAY);
    expect(month2).toMatchObject({ year: 1, season: 'spring', monthOfSeason: 2, dayOfMonth: 1 });

    const summer = getCalendarState(DAYS_PER_SEASON * REAL_MS_PER_INGAME_DAY);
    expect(summer).toMatchObject({ year: 1, season: 'summer', monthOfSeason: 1, dayOfMonth: 1 });

    const year2 = getCalendarState(DAYS_PER_YEAR * REAL_MS_PER_INGAME_DAY);
    expect(year2).toMatchObject({ year: 2, season: 'spring', monthOfSeason: 1, dayOfMonth: 1 });
    expect(HOURS_PER_INGAME_DAY).toBe(24);
    expect(() => getCalendarState(-1)).toThrow(RangeError);
  });

  it('scales population capacity by level and drains food/water by popUsed', () => {
    const spawnBuildings = [{ buildingId: 'main', level: 1, status: 'active' }];
    expect(calculateMaxPopulation(spawnBuildings)).toBe(10);
    expect(calculatePopUsed({ units: {}, buildings: spawnBuildings })).toBe(0);

    const spawnSurvival = calculateDailySurvival({
      popUsed: 0,
      food: STARTER_VILLAGE_POOLS.food,
      water: STARTER_VILLAGE_POOLS.water,
      elapsedDays: 3,
    });
    expect(spawnSurvival.foodRemaining).toBe(5);
    expect(spawnSurvival.waterRemaining).toBe(5);

    const activeVillage = [
      { buildingId: 'main', level: 1, status: 'active' },
      { buildingId: 'firepit', level: 1, status: 'active' },
      { buildingId: 'house', level: 2, status: 'active' },
      { buildingId: 'house', level: 1, status: 'constructing' },
    ];
    expect(calculateMaxPopulation(activeVillage)).toBe(30);

    // 1 Firepit worker + 6 trained units = 7 popUsed -> consumes 7 food + 7 water/day.
    const popUsed = calculatePopUsed({
      units: { gatherer: 3, hunter: 2, builder: 1 },
      buildings: activeVillage,
    });
    expect(popUsed).toBe(7);

    const deficitRun = calculateDailySurvival({ popUsed, food: 5, water: 10, elapsedDays: 1 });
    expect(deficitRun).toMatchObject({
      foodNeeded: 7,
      waterNeeded: 7,
      foodRemaining: 0,
      waterRemaining: 3,
      foodDeficit: 2,
      waterDeficit: 0,
      isStarving: true,
      isDehydrated: false,
    });
  });
});

describe('500m tile distance & round-trip action timers', () => {
  it('computes 0.5 km tile distance and locks builder through outbound + build + return', () => {
    expect(TERRITORY_TILE_DISTANCE_KM).toBe(0.5);
    expect(UNITS.builder.speedKmPerHour).toBe(4);
    expect(UNITS.gatherer.speedKmPerHour).toBe(5);
    expect(UNITS.hunter.speedKmPerHour).toBe(6);
    expect(calculateTileDistanceKm({ x: 12, y: 12 }, { x: 16, y: 12 })).toBe(2);

    // 2 km at 4 km/h = 0.5 in-game hours one-way; Firepit build = 1.5h; total round trip = 2.5h.
    const timing = calculateBuildTimestamps({
      from: { x: 12, y: 12 },
      to: { x: 16, y: 12 },
      buildingId: 'firepit',
      nowMs: 1_000,
    });

    expect(timing.oneWayTravelMs).toBe(0.5 * REAL_MS_PER_INGAME_HOUR);
    expect(timing.buildMs).toBe(1.5 * REAL_MS_PER_INGAME_HOUR);
    expect(timing.arrivesAtMs).toBe(1_000 + 0.5 * REAL_MS_PER_INGAME_HOUR);
    expect(timing.completedAtMs).toBe(1_000 + 2.0 * REAL_MS_PER_INGAME_HOUR);
    expect(timing.builderAvailableAtMs).toBe(1_000 + 2.5 * REAL_MS_PER_INGAME_HOUR);
  });

  it('computes gatherer/hunter round-trip timestamps', () => {
    const gatherTiming = calculateUnitActionTimestamps({
      from: { x: 12, y: 12 },
      to: { x: 12, y: 22 },
      unitId: 'gatherer',
      nowMs: 0,
    });
    // 10 tiles * 0.5 km = 5 km at 5 km/h => 1h outbound + 1h work + 1h return = 3h.
    expect(gatherTiming.distanceKm).toBe(5);
    expect(gatherTiming.oneWayTravelMs).toBe(REAL_MS_PER_INGAME_HOUR);
    expect(gatherTiming.workCompletedAtMs).toBe(2 * REAL_MS_PER_INGAME_HOUR);
    expect(gatherTiming.returnsAtMs).toBe(3 * REAL_MS_PER_INGAME_HOUR);
  });
});

describe('Probabilistic tile yields, collect_water & biome classification', () => {
  it('classifies water, forest, and fields consistently', () => {
    expect(classifyTerritoryTile({ isWater: true, forestDensity: 0.9 })).toBe('water');
    expect(classifyTerritoryTile({ isWater: false, forestDensity: 0.7 })).toBe('forest');
    expect(classifyTerritoryTile({ isWater: false, forestDensity: 0.2 })).toBe('fields');
  });

  it('collects 1 jar (10 water bowls) on water and rejects dry land', () => {
    const waterTile = { isWater: true, forestDensity: 0 };
    const fieldsTile = { isWater: false, forestDensity: 0.1 };

    const res = rollTileActionYield({ unitId: 'gatherer', action: 'collect_water', tile: waterTile });
    expect(res).toEqual({
      terrain: 'water',
      items: {},
      waterBowls: WATER_BOWLS_PER_JAR,
      foundNothing: false,
    });

    expect(() =>
      rollTileActionYield({ unitId: 'gatherer', action: 'collect_water', tile: fieldsTile }),
    ).toThrow(RangeError);
    expect(() =>
      rollTileActionYield({ unitId: 'hunter', action: 'collect_water', tile: waterTile, rng: () => 0.5 }),
    ).toThrow(Error);
  });

  it('produces biome-appropriate Stone Age drops deterministically with seeded PRNG', () => {
    const fieldsTile = { isWater: false, forestDensity: 0.1 };
    const forestTile = { isWater: false, forestDensity: 0.8 };
    const waterTile = { isWater: true, forestDensity: 0 };

    const rng = createPrng(12345);
    const fieldItems = new Set();
    let sawNothing = false;

    for (let i = 0; i < 80; i += 1) {
      const outcome = rollTileActionYield({ unitId: 'gatherer', action: 'gather', tile: fieldsTile, rng });
      if (outcome.foundNothing) sawNothing = true;
      Object.keys(outcome.items).forEach((id) => fieldItems.add(id));
    }
    expect(sawNothing).toBe(true);
    expect(fieldItems.has('straw')).toBe(true);
    expect(fieldItems.has('small_stones')).toBe(true);
    expect(fieldItems.has('seeds')).toBe(true);

    const waterDrops = new Set();
    for (let i = 0; i < 120; i += 1) {
      const outcome = rollTileActionYield({
        unitId: 'gatherer',
        action: 'gather',
        tile: waterTile,
        availableOres: ['flux', 'copper'],
        rng,
      });
      Object.keys(outcome.items).forEach((id) => waterDrops.add(id));
    }
    expect(waterDrops.has('clay')).toBe(true);
    expect(waterDrops.has('copper_nugget')).toBe(true);
    expect(waterDrops.has('flux_nugget')).toBe(false);
    expect(waterDrops.has('coal_nugget')).toBe(false);

    const forestHunt = new Set();
    for (let i = 0; i < 80; i += 1) {
      const outcome = rollTileActionYield({ unitId: 'hunter', action: 'hunt', tile: forestTile, rng });
      Object.keys(outcome.items).forEach((id) => forestHunt.add(id));
    }
    expect(forestHunt.has('meat')).toBe(true);
    expect(forestHunt.has('pelts')).toBe(true);
  });
});

describe('7x7 starter fog, 3x3 border expansion & Continent ring unlock', () => {
  it('starts Territory exploration with centered 7x7 (49 tiles) revealed', () => {
    const fog = createInitialTerritoryFog(25);
    const total = fog.reduce((sum, cell) => sum + cell, 0);
    expect(total).toBe(49);
    expect(fog[9 * 25 + 9]).toBe(1);
    expect(fog[15 * 25 + 15]).toBe(1);
    expect(fog[8 * 25 + 9]).toBe(0);
    expect(fog[16 * 25 + 15]).toBe(0);
  });

  it('expands [[1,1,1,0],[1,1,1,0],[1,1,x,0],[0,0,0,0]] on x=(2,2) into a 14-tile 4x4 frontier', () => {
    const grid = new Uint8Array([
      1, 1, 1, 0,
      1, 1, 1, 0,
      1, 1, 1, 0,
      0, 0, 0, 0,
    ]);

    const res = revealBox3x3(grid, 4, 2, 2);
    expect(Array.from(res.fog)).toEqual([
      1, 1, 1, 0,
      1, 1, 1, 1,
      1, 1, 1, 1,
      0, 1, 1, 1,
    ]);
    expect(res.newlyRevealedCount).toBe(5);
    expect(res.totalExplored).toBe(14);
    expect(res.isFullyExplored).toBe(false);

    // Reject targeting an unexplored tile.
    expect(() => revealBox3x3(grid, 4, 3, 3)).toThrow(Error);
  });

  it('unlocks the 3x3 Continent ring around village only after all 625 Territory tiles are explored', () => {
    const continentFog = new Uint8Array(100 * 100);
    continentFog[50 * 100 + 50] = 1;

    const locked = unlockContinentRingIfTerritoryComplete({
      continentFog,
      villageX: 50,
      villageY: 50,
      territoryExploredCount: 624,
    });
    expect(locked.unlocked).toBe(false);
    expect(locked.newlyRevealedCount).toBe(0);

    const unlocked = unlockContinentRingIfTerritoryComplete({
      continentFog,
      villageX: 50,
      villageY: 50,
      territoryExploredCount: 625,
    });
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.newlyRevealedCount).toBe(8);
    expect(unlocked.fog[49 * 100 + 49]).toBe(1);
    expect(unlocked.fog[51 * 100 + 51]).toBe(1);
  });
});
