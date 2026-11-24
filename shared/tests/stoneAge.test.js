import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  DAYS_PER_MONTH,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  HOURS_PER_INGAME_DAY,
  ORES,
  PANNABLE_ORE_NUGGETS,
  REAL_MS_PER_INGAME_DAY,
  REAL_MS_PER_INGAME_HOUR,
  RECIPES,
  RESOURCES,
  ROCK_TYPES,
  SIZE_CLASSES,
  STARTER_INVENTORY,
  STARTER_UNLOCKED_TECHS,
  STARTER_VILLAGE_POOLS,
  STARVATION_DEBUFF_STAGES,
  TECHNOLOGIES,
  TERRITORY_TILE_DISTANCE_KM,
  UNITS,
  WATER_BOWLS_PER_JAR,
  advanceStarvationState,
  applyDailySpoilage,
  calculateBuildTimestamps,
  calculateDailySurvival,
  calculateMaxPopulation,
  calculatePopUsed,
  calculateStorageCapacity,
  calculateStorageUsed,
  calculateTeamActionTimestamps,
  calculateTileDistanceKm,
  calculateTotalStoredFood,
  calculateUnitActionTimestamps,
  calculateWaterCapacity,
  canBuildOrUpgradeBuilding,
  classifyTerritoryTile,
  consumeStoredFoodFEFO,
  createBuilding,
  createInitialTerritoryFog,
  createPrng,
  createRecipe,
  createResource,
  createTechnology,
  createUnit,
  generateContinent,
  getAmbientTemperatureCelsius,
  getBestUnlockedTool,
  getCalendarState,
  getExploredBounds,
  getMainTierChangeRule,
  getStarvationStageInfo,
  getTaskPhase,
  isTechTriggerSatisfied,
  normalizedTempToCelsius,
  pickStarterSpawnTile,
  resolveTeamActionYield,
  revealBox3x3,
  rollTileActionYield,
  trimUnitsBalanced,
  unlockContinentRingIfTerritoryComplete,
} from '../index.js';

describe('Stone Age templates, starter pools & linear sizeClass', () => {
  it('enforces linear sizeClass 1..5 and stores tools in Technologies rather than inventory', () => {
    expect(SIZE_CLASSES).toEqual({
      1: 'tiny',
      2: 'small',
      3: 'medium',
      4: 'big',
      5: 'large',
    });

    expect(RESOURCES.wood_tool).toBeUndefined();
    expect(RESOURCES.stone_tool).toBeUndefined();
    expect(RECIPES.upgrade_stone_tool).toBeUndefined();
    expect(STARTER_UNLOCKED_TECHS).toEqual(['wood_tools']);
    expect(STARTER_VILLAGE_POOLS.mainTier).toBe(1);
    expect(STARTER_VILLAGE_POOLS.mainLevel).toBe(1);

    expect(RESOURCES.straw.sizeClass).toBe(2);
    expect(RESOURCES.cooked_fish.edible).toBe(true);
    expect(calculateStorageUsed(STARTER_INVENTORY)).toBe(60);
    expect(calculateTotalStoredFood(STARTER_INVENTORY)).toBe(5);
    expect(STARTER_VILLAGE_POOLS.storageCapacity).toBe(250);
    expect(BUILDINGS.main.storageBonusPerLevel).toBe(250);
    expect(STARTER_VILLAGE_POOLS.water).toBe(5);
    expect(STARTER_VILLAGE_POOLS.waterCapacity).toBe(10);
  });

  it('excludes flux, coal, and salt from pannable river/lake ore nuggets while placing salt in limestone/shale', () => {
    expect(PANNABLE_ORE_NUGGETS).toContain('copper_nugget');
    expect(PANNABLE_ORE_NUGGETS).not.toContain('flux_nugget');
    expect(PANNABLE_ORE_NUGGETS).not.toContain('coal_nugget');
    expect(PANNABLE_ORE_NUGGETS).not.toContain('salt_nugget');
    expect(ORES.salt).toBeDefined();
    expect(ROCK_TYPES.find((r) => r.id === 'limestone').ores).toContain('salt');
    expect(ROCK_TYPES.find((r) => r.id === 'shale').ores).toContain('salt');
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
    expect(RECIPES.smelt_copper_ingot.unlocksTech).toBe('copper_age');
  });

  it('validates factory inputs and rejects out-of-range configurations', () => {
    expect(() => createResource({ id: 'bad', name: 'Bad', sizeClass: 6 })).toThrow(RangeError);
    expect(() => createUnit({ id: 'bad', name: 'Bad', speedKmPerHour: 0 })).toThrow(RangeError);
    expect(() => createBuilding({ id: 'bad', name: 'Bad', maxLevel: 0 })).toThrow(RangeError);
    expect(() => createTechnology({ id: 'bad', name: 'Bad', age: 'space' })).toThrow(Error);
    expect(() =>
      createRecipe({ id: 'bad', name: 'Bad', buildingId: 'kiln', inputs: {}, outputs: { a: 1 }, craftTimeHours: 1 }),
    ).toThrow(Error);
  });
});

describe('Technology tree triggers, tool modifiers & Main Tier/Level Age controller', () => {
  it('auto-selects the highest unlocked tool and checks branch unlock triggers', () => {
    expect(getBestUnlockedTool(STARTER_UNLOCKED_TECHS).id).toBe('wood_tools');
    expect(getBestUnlockedTool(['wood_tools', 'stone_tools']).id).toBe('stone_tools');
    expect(getBestUnlockedTool([])).toBeNull();

    expect(isTechTriggerSatisfied('wood_tools')).toBe(true);
    expect(isTechTriggerSatisfied('stone_tools', { builtBuildings: [] })).toBe(false);
    expect(
      isTechTriggerSatisfied('stone_tools', {
        builtBuildings: [{ buildingId: 'firepit', status: 'constructing' }],
      }),
    ).toBe(false);
    expect(
      isTechTriggerSatisfied('stone_tools', {
        builtBuildings: [{ buildingId: 'firepit', status: 'active' }],
      }),
    ).toBe(true);
    expect(isTechTriggerSatisfied('copper_age', { craftedCounts: { copper_ingot: 0 } })).toBe(false);
    expect(isTechTriggerSatisfied('copper_age', { craftedCounts: { copper_ingot: 1 } })).toBe(true);
  });

  it('applies stone_tools modifiers: +20% work speed, +1 max loot, and halves empty weight', () => {
    const woodTiming = calculateUnitActionTimestamps({
      from: { x: 12, y: 12 },
      to: { x: 12, y: 14 },
      unitId: 'gatherer',
      unlockedTechs: ['wood_tools'],
      nowMs: 0,
    });
    const stoneTiming = calculateUnitActionTimestamps({
      from: { x: 12, y: 12 },
      to: { x: 12, y: 14 },
      unitId: 'gatherer',
      unlockedTechs: ['wood_tools', 'stone_tools'],
      nowMs: 0,
    });
    expect(woodTiming.workMs).toBe(600_000);
    expect(stoneTiming.workMs).toBe(500_000);
    expect(stoneTiming.oneWayTravelMs).toBe(woodTiming.oneWayTravelMs);

    const fieldsTile = { isWater: false, forestDensity: 0.1 };
    const stoneRng = createPrng(999);
    const woodRng = createPrng(999);
    let stoneEmpty = 0;
    let woodEmpty = 0;
    let stoneMaxQty = 0;

    for (let i = 0; i < 200; i += 1) {
      const s = rollTileActionYield({
        unitId: 'gatherer',
        action: 'gather',
        tile: fieldsTile,
        unlockedTechs: ['wood_tools', 'stone_tools'],
        rng: stoneRng,
      });
      const w = rollTileActionYield({
        unitId: 'gatherer',
        action: 'gather',
        tile: fieldsTile,
        unlockedTechs: ['wood_tools'],
        rng: woodRng,
      });
      if (s.foundNothing) stoneEmpty += 1;
      if (w.foundNothing) woodEmpty += 1;
      for (const qty of Object.values(s.items)) {
        if (qty > stoneMaxQty) stoneMaxQty = qty;
      }
    }

    expect(stoneEmpty).toBeLessThan(woodEmpty);
    expect(stoneMaxQty).toBe(3); // base max 2 + stone_tools yieldBonus 1
  });

  it('gates KILN on stone_tools and enforces Main Tier downgrade/upgrade rules', () => {
    const kilnBlocked = canBuildOrUpgradeBuilding({
      buildingId: 'kiln',
      currentLevel: 0,
      mainTier: 1,
      unlockedTechs: ['wood_tools'],
    });
    expect(kilnBlocked.allowed).toBe(false);

    const kilnReady = canBuildOrUpgradeBuilding({
      buildingId: 'kiln',
      currentLevel: 0,
      mainTier: 2,
      unlockedTechs: ['wood_tools', 'stone_tools'],
    });
    expect(kilnReady).toEqual({ allowed: true, reason: null, spawnTier: 2 });

    // Existing Tier 2 house cannot upgrade while Main is downgraded to Tier 1.
    const downgradedHouseUpgrade = canBuildOrUpgradeBuilding({
      buildingId: 'house',
      currentLevel: 1,
      targetLevel: 2,
      buildingTier: 2,
      mainTier: 1,
      unlockedTechs: ['wood_tools', 'stone_tools'],
    });
    expect(downgradedHouseUpgrade.allowed).toBe(false);

    // Main upgrade from 1 -> 2 requires copper_age and always uses normal materials.
    const deniedUpgrade = getMainTierChangeRule({
      currentMainTier: 1,
      targetMainTier: 2,
      unlockedTechs: ['wood_tools', 'stone_tools'],
    });
    expect(deniedUpgrade.allowed).toBe(false);

    const allowedUpgrade = getMainTierChangeRule({
      currentMainTier: 1,
      targetMainTier: 2,
      unlockedTechs: ['wood_tools', 'stone_tools', 'copper_age'],
    });
    expect(allowedUpgrade).toMatchObject({
      allowed: true,
      direction: 'upgrade',
      isFree: false,
      cost: BUILDINGS.main.tierUpgrades[2].cost,
      buildTimeHours: 4.0,
      targetAge: 'copper',
    });
    expect(allowedUpgrade.cost.copper_ingot).toBeUndefined();

    // Downgrade is always free at 0 cost.
    const freeDowngrade = getMainTierChangeRule({
      currentMainTier: 2,
      targetMainTier: 1,
      unlockedTechs: ['wood_tools', 'stone_tools', 'copper_age'],
    });
    expect(freeDowngrade).toMatchObject({
      allowed: true,
      direction: 'downgrade',
      isFree: true,
      cost: {},
      buildTimeHours: 0,
      targetAge: 'stone',
    });
    expect(TECHNOLOGIES.copper_age.unlocksMainTier).toBe(2);
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
      food: calculateTotalStoredFood(STARTER_INVENTORY),
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
    ).not.toThrow();
    expect(UNITS.hunter.allowedActions).toContain('collect_water');
  });

  it('calculates mixed-team slowest speed, action-filtered yields, and Going/Doing/Returning phases', () => {
    // 2 Gatherers (5 km/h) + 1 Hunter (6 km/h) -> marches at slowest 5 km/h.
    const mixedTiming = calculateTeamActionTimestamps({
      from: { x: 12, y: 12 },
      to: { x: 12, y: 22 },
      units: { gatherer: 2, hunter: 1 },
      nowMs: 1_000,
    });
    expect(mixedTiming.teamSpeedKmPerHour).toBe(5);
    expect(mixedTiming.oneWayTravelMs).toBe(REAL_MS_PER_INGAME_HOUR);

    expect(getTaskPhase(mixedTiming, 1_500)).toMatchObject({ phase: 'going', phaseLabel: 'Traveling' });
    expect(
      getTaskPhase({ ...mixedTiming, completedAtMs: mixedTiming.workCompletedAtMs }, mixedTiming.arrivesAtMs + 100),
    ).toMatchObject({ phase: 'doing', phaseLabel: 'Working' });
    expect(
      getTaskPhase({ ...mixedTiming, completedAtMs: mixedTiming.workCompletedAtMs }, mixedTiming.workCompletedAtMs + 100),
    ).toMatchObject({ phase: 'returning', phaseLabel: 'Returning' });

    const fieldsTile = { isWater: false, forestDensity: 0.1 };
    const waterTile = { isWater: true, forestDensity: 0 };
    const rng = createPrng(4242);

    // Choose gather on a 2G + 1H team -> only 2 Gatherers roll.
    const gatherRes = resolveTeamActionYield({
      units: { gatherer: 2, hunter: 1 },
      action: 'gather',
      tile: fieldsTile,
      rng,
    });
    expect(gatherRes.rollsExecuted).toBe(2);

    // Choose collect_water on a 2G + 1H team -> all 3 units collect 1 jar each (30 bowls).
    const waterRes = resolveTeamActionYield({
      units: { gatherer: 2, hunter: 1 },
      action: 'collect_water',
      tile: waterTile,
      rng,
    });
    expect(waterRes.rollsExecuted).toBe(3);
    expect(waterRes.waterBowls).toBe(30);

    // Smart Role Assignment ('team') runs Gatherer rolls + Hunter rolls + Water hauling together.
    const combinedTeamRes = resolveTeamActionYield({
      units: { gatherer: 2, hunter: 1, water: 1 },
      action: 'team',
      tile: waterTile,
      rng,
    });
    expect(combinedTeamRes.rollsExecuted).toBe(4);
    expect(combinedTeamRes.waterBowls).toBe(10);
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

    // Non-copper Granite rock still drops common copper_nugget more often than very_rare gems,
    // and copper-hosting rock increases copper_nugget drop counts (~2x weight).
    const countPannedNuggets = (availableOres) => {
      const counts = { copper_nugget: 0, gems_nugget: 0 };
      const sampleRng = createPrng(7777);
      for (let i = 0; i < 600; i += 1) {
        const res = rollTileActionYield({
          unitId: 'gatherer',
          action: 'gather',
          tile: waterTile,
          availableOres,
          rng: sampleRng,
        });
        for (const [id, q] of Object.entries(res.items)) {
          if (counts[id] !== undefined) counts[id] += q;
        }
      }
      return counts;
    };

    const graniteDrops = countPannedNuggets(['tin', 'silver', 'gold']);
    const limestoneDrops = countPannedNuggets(['flux', 'copper']);
    expect(graniteDrops.copper_nugget).toBeGreaterThan(20);
    expect(graniteDrops.copper_nugget).toBeGreaterThan(graniteDrops.gems_nugget);
    expect(limestoneDrops.copper_nugget).toBeGreaterThan(graniteDrops.copper_nugget);

    // Celsius conversion (-20°C..+40°C) + seasonal & diurnal climate adjustments.
    expect(normalizedTempToCelsius(0)).toBe(-20);
    expect(normalizedTempToCelsius(0.5)).toBe(10);
    expect(normalizedTempToCelsius(1)).toBe(40);
    expect(getAmbientTemperatureCelsius(0.5, { season: 'summer', isDaylight: true })).toBe(18);
    expect(getAmbientTemperatureCelsius(0.5, { season: 'winter', isDaylight: false })).toBe(0);

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

  it('picks a deterministic buildable starter tile in the 30%..70% central N-S band and computes explored bounds', () => {
    expect(UNITS.gatherer.trainingTimeHours).toBe(0);
    expect(UNITS.hunter.trainingTimeHours).toBe(0);
    expect(UNITS.builder.trainingTimeHours).toBe(0);

    const continent = generateContinent('spawn-test-seed', { size: 40 });
    const spawnA = pickStarterSpawnTile(continent, 'spawn-test-seed');
    const spawnB = pickStarterSpawnTile(continent, 'spawn-test-seed');

    expect(spawnA).toEqual(spawnB);
    expect(spawnA.buildable).toBe(true);
    expect(spawnA.isObelisk).toBe(false);
    expect(spawnA.y).toBeGreaterThanOrEqual(Math.floor(40 * 0.3));
    expect(spawnA.y).toBeLessThanOrEqual(Math.ceil(40 * 0.7) - 1);

    const fog = createInitialTerritoryFog(25);
    expect(getExploredBounds(fog, 25)).toEqual({
      minX: 9,
      maxX: 15,
      minY: 9,
      maxY: 15,
      width: 7,
      height: 7,
      exploredCount: 49,
    });
  });
});

describe('Storage pooling (M1), FEFO auto-eating (C1), fractional spoilage (S1), Salt/Drying & 5-stage debuffs', () => {
  it('pools storage across active Main + Warehouses and supports future preserved storage multipliers', () => {
    const cap = calculateStorageCapacity([
      { buildingId: 'main', level: 2, status: 'active' },
      { buildingId: 'warehouse', level: 2, status: 'active' },
      { buildingId: 'warehouse', level: 1, status: 'constructing' },
    ]);
    expect(cap).toEqual({
      generalCapacity: 1000,
      preservedFoodCapacity: 0,
      totalCapacity: 1000,
      preservedSpoilageMultiplier: 1,
    });

    expect(BUILDINGS.warehouse.requiredTechs).toEqual([]);
    expect(BUILDINGS.warehouse.cost).toEqual({ sticks: 8, pelts: 4, straw: 6 });
    expect(BUILDINGS.drying_rack.requiredTechs).toEqual(['stone_tools']);
    expect(RECIPES.boil_salt.waterCostBowls).toBe(10);
    expect(RECIPES.boil_salt.outputs).toEqual({ salt: 2 });
    expect(RECIPES.salt_meat.inputs).toEqual({ meat: 1, salt: 1 });
    expect(RESOURCES.dried_meat.spoilRatePerDay).toBeLessThan(RESOURCES.cooked_meat.spoilRatePerDay);
    expect(RESOURCES.salted_meat.spoilRatePerDay).toBeLessThan(RESOURCES.dried_meat.spoilRatePerDay);
  });

  it('auto-consumes fastest-spoiling edible items first (FEFO) and retains multi-ration foodCarry', () => {
    const day1 = consumeStoredFoodFEFO({
      inventory: { salted_meat: 2, cooked_meat: 1, berries: 1 },
      foodCarry: 0,
      foodNeeded: 2,
    });
    // Eats berries first (25%/d, 1 food), then breaks 1 cooked_meat (20%/d, 3 food) -> leftover 2 carry.
    expect(day1.consumed).toEqual({ berries: 1, cooked_meat: 1 });
    expect(day1.inventory).toEqual({ salted_meat: 2 });
    expect(day1.foodCarry).toBe(2);
    expect(day1.isStarving).toBe(false);

    // Day 2 consumes from foodCarry first before touching salted_meat (1%/d).
    const day2 = consumeStoredFoodFEFO({
      inventory: day1.inventory,
      foodCarry: day1.foodCarry,
      foodNeeded: 2,
    });
    expect(day2.consumed).toEqual({});
    expect(day2.inventory).toEqual({ salted_meat: 2 });
    expect(day2.foodCarry).toBe(0);

    // Deficit case
    const starved = consumeStoredFoodFEFO({
      inventory: { berries: 1 },
      foodCarry: 0,
      foodNeeded: 4,
    });
    expect(starved.foodDeficit).toBe(3);
    expect(starved.isStarving).toBe(true);
    expect(starved.inventory).toEqual({});
  });

  it('applies per-type fractional spoilage carry without deleting small stacks on Day 1', () => {
    const day1 = applyDailySpoilage({
      inventory: { berries: 2, fish: 10 },
      spoilageCarry: {},
      elapsedDays: 1,
    });
    // berries: 2 * 0.25 = 0.50 -> 0 lost, carry 0.5; fish: 10 * 0.5 = 5 -> 5 lost, carry 0.
    expect(day1.inventory).toEqual({ berries: 2, fish: 5 });
    expect(day1.spoilageCarry).toEqual({ berries: 0.5 });
    expect(day1.spoiled).toEqual({ fish: 5 });

    const day2 = applyDailySpoilage({
      inventory: day1.inventory,
      spoilageCarry: day1.spoilageCarry,
      elapsedDays: 1,
    });
    // berries: 0.5 + 2*0.25 = 1.0 -> 1 lost, carry 0; fish: 5*0.5 = 2.5 -> 2 lost, carry 0.5.
    expect(day2.inventory).toEqual({ berries: 1, fish: 3 });
    expect(day2.spoilageCarry).toEqual({ fish: 0.5 });
    expect(day2.spoiled).toEqual({ berries: 1, fish: 2 });
  });

  it('progresses 5 starvation debuff stages, reaches abandoned at 0 maxPop, and recovers when fed', () => {
    expect(STARVATION_DEBUFF_STAGES.map((s) => s.efficiencyPenalty)).toEqual([0, 0.1, 0.3, 0.5, 0.8, 0.8]);

    let s = advanceStarvationState({ hasDeficit: true, buildingMaxPop: 10, elapsedDays: 1 });
    expect(s.stage.id).toBe('hunger_1');
    expect(s.efficiencyPenalty).toBe(0.1);

    s = advanceStarvationState({ ...s, hasDeficit: true, buildingMaxPop: 10, elapsedDays: 1 });
    expect(s.stage.id).toBe('hunger_2');
    expect(s.efficiencyPenalty).toBe(0.3);

    s = advanceStarvationState({ ...s, hasDeficit: true, buildingMaxPop: 10, elapsedDays: 1 });
    expect(s.stage.id).toBe('hunger_3');
    expect(s.efficiencyPenalty).toBe(0.5);

    s = advanceStarvationState({ ...s, hasDeficit: true, buildingMaxPop: 10, elapsedDays: 1 });
    expect(s.stage.id).toBe('sickness');
    expect(s.efficiencyPenalty).toBe(0.8);
    expect(s.effectiveMaxPop).toBe(10);

    // Day 5 Death: -10% maxPop (-1 out of 10) while holding 80% penalty.
    s = advanceStarvationState({ ...s, hasDeficit: true, buildingMaxPop: 10, elapsedDays: 1 });
    expect(s.stage.id).toBe('death');
    expect(s.efficiencyPenalty).toBe(0.8);
    expect(s.starvationPopLoss).toBe(1);
    expect(s.effectiveMaxPop).toBe(9);

    // Fed recovery: +20% efficiency/day, +10% maxPop/day -> fully restored after 4 fed days.
    const fed1 = advanceStarvationState({ ...s, hasDeficit: false, buildingMaxPop: 10, elapsedDays: 1 });
    expect(fed1.efficiencyPenalty).toBe(0.6);
    expect(fed1.starvationPopLoss).toBe(0);
    expect(fed1.effectiveMaxPop).toBe(10);

    const fedFull = advanceStarvationState({ ...fed1, hasDeficit: false, buildingMaxPop: 10, elapsedDays: 3 });
    expect(fedFull.efficiencyPenalty).toBe(0);
    expect(fedFull.starvationDays).toBe(0);
    expect(fedFull.stage.id).toBe('healthy');
    expect(getStarvationStageInfo(fedFull).label).toBe('Healthy');

    // Prolonged famine collapses maxPop to 0 -> abandoned village.
    const abandoned = advanceStarvationState({ hasDeficit: true, buildingMaxPop: 10, elapsedDays: 14 });
    expect(abandoned.isAbandoned).toBe(true);
    expect(abandoned.effectiveMaxPop).toBe(0);
    expect(abandoned.stage.id).toBe('abandoned');
  });

  it('slows unit/build timers and reduces yields/water when efficiencyPenalty > 0', () => {
    const healthyBuild = calculateBuildTimestamps({
      to: { x: 14, y: 12 },
      buildingId: 'firepit',
      nowMs: 0,
      efficiencyPenalty: 0,
    });
    const hunger3Build = calculateBuildTimestamps({
      to: { x: 14, y: 12 },
      buildingId: 'firepit',
      nowMs: 0,
      efficiencyPenalty: 0.5,
    });
    expect(hunger3Build.buildMs).toBe(healthyBuild.buildMs * 2);

    const healthyTeam = calculateTeamActionTimestamps({
      to: { x: 14, y: 12 },
      units: { gatherer: 1 },
      nowMs: 0,
      efficiencyPenalty: 0,
    });
    const sickTeam = calculateTeamActionTimestamps({
      to: { x: 14, y: 12 },
      units: { gatherer: 1 },
      nowMs: 0,
      efficiencyPenalty: 0.8,
    });
    expect(sickTeam.workMs).toBe(healthyTeam.workMs * 5);

    const sickWater = rollTileActionYield({
      unitId: 'gatherer',
      action: 'collect_water',
      tile: { isWater: true, forestDensity: 0 },
      efficiencyPenalty: 0.8,
      rng: createPrng(1),
    });
    expect(sickWater.waterBowls).toBe(2);
  });

  it('uses basic materials for Main/House/Warehouse/Drying Rack, scales Main water capacity by level, and trims starved units evenly', () => {
    for (const id of ['main', 'house', 'warehouse', 'drying_rack']) {
      expect(Object.keys(BUILDINGS[id].cost).every((res) => ['sticks', 'pelts', 'straw'].includes(res))).toBe(true);
    }
    expect(BUILDINGS.firepit.cost.small_stones).toBeGreaterThan(0);
    expect(BUILDINGS.kiln.cost.small_stones).toBeGreaterThan(0);

    expect(calculateWaterCapacity([{ buildingId: 'main', level: 1, status: 'active' }])).toBe(10);
    expect(calculateWaterCapacity([{ buildingId: 'main', level: 2, status: 'active' }])).toBe(25);
    expect(calculateWaterCapacity([{ buildingId: 'main', level: 3, status: 'active' }])).toBe(50);

    // Highest-pop equal casualty splitting matching exact multi-day progression and whole-unit kills.
    const seq1 = trimUnitsBalanced({ gatherer: 13, hunter: 7, builder: 2 }, 4);
    expect(seq1.units).toEqual({ gatherer: 9, hunter: 7, builder: 2 });

    const seq2 = trimUnitsBalanced(seq1.units, 5);
    expect(seq2.units).toEqual({ gatherer: 5, hunter: 6, builder: 2 });

    const seq3 = trimUnitsBalanced({ gatherer: 3, hunter: 2, builder: 2 }, 5);
    expect(seq3.units).toEqual({ gatherer: 0, hunter: 1, builder: 1 });

    // Multi-pop unit (popCost = 2) kills a full unit (never half) and reduces excess demand by 2.
    const heavyExact = trimUnitsBalanced({ heavy: 2, gatherer: 1 }, 2, { heavy: 2, gatherer: 1 });
    expect(heavyExact.units).toEqual({ heavy: 1, gatherer: 1 });

    const heavyOnly = trimUnitsBalanced({ heavy: 2 }, 1, { heavy: 2 });
    expect(heavyOnly.units).toEqual({ heavy: 1 });
    expect(heavyOnly.trimmedTotal).toBe(1);
  });
});
