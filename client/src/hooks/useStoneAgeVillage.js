import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AGES,
  BUILDINGS,
  CROPS,
  LIVESTOCK,
  ORCHARD_TREES,
  REAL_MS_PER_INGAME_DAY,
  REAL_MS_PER_INGAME_HOUR,
  RECIPES,
  RESOURCES,
  ROCK_TYPES,
  STARTER_INVENTORY,
  STARTER_UNLOCKED_TECHS,
  STARTER_VILLAGE_POOLS,
  TECHNOLOGIES,
  UNITS,
  BUILDING_DEGRADATION_GRACE_DAYS,
  FERTILIZER_TO_NUTRIENT,
  advanceContinuousProduction,
  advanceCropFieldsAndOrchards,
  advanceDailyBuildingDegradation,
  advanceDailyLivestock,
  advanceStarvationState,
  applyDailySpoilage,
  calculateAnimalPenCapacity,
  calculateBuildTimestamps,
  calculateBuildingRepairCost,
  calculateContinentExpeditionPlan,
  calculateFarmMaxAttachments,
  calculateFarmSeedCapacity,
  calculateMarketTradePlan,
  calculateMaxPopulation,
  calculatePopUsed,
  calculateRepairAllCost,
  calculateStorageCapacity,
  calculateStorageUsed,
  calculateTeamActionTimestamps,
  calculateTotalStoredFood,
  calculateUnitActionTimestamps,
  calculateWaterCapacity,
  canBuildOrUpgradeBuilding,
  canCancelTask,
  canDemolishBuilding,
  consumeStoredFoodFEFO,
  createEmptyCropPlot,
  createEmptyOrchardPlot,
  createInitialTerritoryFog,
  createPrng,
  fertilizeCropPlot,
  getAmbientTemperatureCelsius,
  getBuildingTierUpgradeRule,
  getCalendarState,
  getMainTierChangeRule,
  getStarvationStageInfo,
  getUnitRefitRule,
  getUnitTrainingCost,
  getWallBonuses,
  hashCoords,
  initializeTileDeposit,
  isTechTriggerSatisfied,
  plantCropPlot,
  plantOrchardPlot,
  resolveContinentExpedition,
  resolveCropHarvest,
  resolveOrchardHarvest,
  resolveTeamActionYield,
  revealBox3x3,
  rollWildAnimalCapture,
  slaughterLivestock,
  trimUnitsBalanced,
  unlockContinentRingIfTerritoryComplete,
  validateBuildingPlacement,
} from '@obelisk/shared';

/** Supported local/dev speed multipliers (6x = baseline 1 in-game day per 4 real hours). */
export const SPEED_OPTIONS = Object.freeze([
  1, 2, 3, 4, 6, 8, 12, 24, 48, 60, 120, 240, 360, 720, 3600,
]);

/**
 * Checks whether an inventory map satisfies every cost quantity.
 *
 * @param {Record<string, number>} inventory - Available inventory counts.
 * @param {Record<string, number>} cost - Required resource counts.
 * @returns {boolean} True when every requirement is met.
 */
function hasEnoughResources(inventory, cost) {
  return Object.entries(cost ?? {}).every(([id, qty]) => (inventory[id] ?? 0) >= qty);
}

/**
 * Deducts `cost` from `inventory` returning a new immutable inventory map.
 *
 * @param {Record<string, number>} inventory - Source inventory.
 * @param {Record<string, number>} cost - Quantities to subtract.
 * @returns {Record<string, number>} Updated inventory copy.
 */
function spendResources(inventory, cost) {
  const next = { ...inventory };
  for (const [id, qty] of Object.entries(cost ?? {})) {
    next[id] = Math.max(0, (next[id] ?? 0) - qty);
  }
  return next;
}

/**
 * Adds produced or gathered items to inventory respecting remaining bulk capacity.
 *
 * @param {Record<string, number>} inventory - Existing items.
 * @param {Record<string, number>} additions - Items to add.
 * @param {number} maxCapacity - Storage bulk limit.
 * @returns {{ inventory: Record<string, number>, dropped: boolean }} Updated inventory and overflow flag.
 */
function addItemsWithinCapacity(inventory, additions, maxCapacity) {
  const next = { ...inventory };
  let used = calculateStorageUsed(next);
  let dropped = false;

  for (const [id, qty] of Object.entries(additions ?? {})) {
    const unitBulk = RESOURCES[id]?.sizeClass ?? 1;
    for (let i = 0; i < qty; i += 1) {
      if (used + unitBulk <= maxCapacity) {
        next[id] = (next[id] ?? 0) + 1;
        used += unitBulk;
      } else {
        dropped = true;
      }
    }
  }

  return { inventory: next, dropped };
}

/**
 * Reveals the 3x3 Territory border around (x, y) upon team/builder return and
 * unlocks the 3x3 Continent ring when Territory coverage reaches 100%.
 *
 * @param {object} params
 * @returns {{ territoryFog: Uint8Array, continentFog: Uint8Array }} Updated fog masks.
 */
function revealTerritoryBorderOnReturn({
  territoryFog,
  continentFog,
  territorySize,
  continentSize,
  x,
  y,
  spawnTile,
  newLogs,
}) {
  const fogStep = revealBox3x3(territoryFog, territorySize, x, y);
  let nextContinentFog = continentFog;
  if (fogStep.newlyRevealedCount > 0) {
    newLogs.push(`Explored +${fogStep.newlyRevealedCount} Territory tiles.`);
  }

  if (fogStep.isFullyExplored) {
    const ring = unlockContinentRingIfTerritoryComplete({
      continentFog,
      continentSize,
      villageX: spawnTile.x,
      villageY: spawnTile.y,
      territoryExploredCount: fogStep.totalExplored,
      territoryTotalTiles: territorySize * territorySize,
    });
    nextContinentFog = ring.fog;
    if (ring.newlyRevealedCount > 0) {
      newLogs.push('Territory 100% explored! Unlocked 3x3 Continent ring around your village.');
    }
  }

  return { territoryFog: fogStep.fog, continentFog: nextContinentFog };
}

const DEFAULT_UNIT_COUNTS = Object.freeze(
  Object.fromEntries(Object.keys(UNITS).map((id) => [id, 0])),
);

const DEFAULT_UNIT_TIERS = Object.freeze({
  spearman: 2,
  swordsman: 2,
  archer: 2,
  cavalry: 2,
});

function loadMarketOffers(marketStorageKey) {
  if (!marketStorageKey) return [];
  try {
    const raw = window.localStorage.getItem(marketStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMarketOffers(marketStorageKey, offers) {
  if (!marketStorageKey) return;
  try {
    window.localStorage.setItem(marketStorageKey, JSON.stringify(offers));
  } catch {
    // Ignore storage quota or private mode issues.
  }
}

function creditInactiveTerritoryInStorage({
  targetStorageKey,
  itemId,
  qty,
  escrowOfferIdToClear = null,
  logMessage,
}) {
  if (!targetStorageKey) return;
  try {
    const raw = window.localStorage.getItem(targetStorageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return;
    const nextEscrows = { ...(saved.marketEscrows ?? {}) };
    if (escrowOfferIdToClear) {
      delete nextEscrows[escrowOfferIdToClear];
    }
    const maxCap = calculateStorageCapacity(saved.buildings ?? [], saved.inventory ?? {}).totalCapacity;
    const added = addItemsWithinCapacity(saved.inventory ?? {}, { [itemId]: qty }, maxCap);
    const updated = {
      ...saved,
      inventory: added.inventory,
      marketEscrows: nextEscrows,
      logs: [logMessage, ...(saved.logs ?? [])].slice(0, 24),
    };
    window.localStorage.setItem(targetStorageKey, JSON.stringify(updated));
  } catch {
    // Ignore corrupted target saves cleanly.
  }
}

/**
 * Aggregates busy unit counts across all active village tasks and locked Market offer escrows.
 *
 * @param {Array<object>} tasks - Active task list.
 * @param {Record<string, object>} [marketEscrows={}] - Open/in-transit Market offer Caravan holds.
 * @returns {Record<string, number>} Busy counts keyed by unitId.
 */
function calculateBusyUnits(tasks, marketEscrows = {}) {
  const busy = { ...DEFAULT_UNIT_COUNTS };
  for (const task of tasks ?? []) {
    if (
      task.kind === 'build' ||
      task.kind === 'upgrade' ||
      task.kind === 'upgrade_main' ||
      task.kind === 'upgrade_tier' ||
      task.kind === 'upgrade_wall'
    ) {
      busy.builder += task.buildersUsed ?? 1;
    } else if (task.kind === 'prospect') {
      busy.prospector += 1;
    } else if (task.kind === 'unit_action' || task.kind === 'expedition') {
      if (task.units) {
        for (const [id, q] of Object.entries(task.units)) {
          if (busy[id] !== undefined) busy[id] += q ?? 0;
        }
      } else if (busy[task.unitId] !== undefined) {
        busy[task.unitId] += 1;
      }
    }
  }
  for (const escrow of Object.values(marketEscrows ?? {})) {
    if (escrow?.caravansNeeded > 0) {
      busy.caravan += escrow.caravansNeeded;
    }
  }
  return busy;
}

/**
 * Builds the initial Stone Age village state for a world spawn and seed.
 *
 * @param {object} params
 * @param {string} params.seed
 * @param {{ x: number, y: number }} params.spawnTile
 * @param {number} params.continentSize
 * @param {number} params.territorySize
 * @param {string[]} [params.globalUnlockedTechs]
 * @returns {object} Fresh serializable village state.
 */
function createInitialState({
  sessionKey,
  seed,
  spawnTile,
  continentSize,
  territorySize,
  globalUnlockedTechs = null,
}) {
  const center = Math.floor(territorySize / 2);
  const territoryFog = createInitialTerritoryFog(territorySize);
  const continentFog = new Uint8Array(continentSize * continentSize);
  continentFog[spawnTile.y * continentSize + spawnTile.x] = 1;
  const mergedTechs = [...new Set([...STARTER_UNLOCKED_TECHS, ...(globalUnlockedTechs ?? [])])];

  return {
    sessionKey,
    seed,
    spawnKey: `${spawnTile.x},${spawnTile.y}`,
    continentSize,
    territorySize,
    speedFactor: 6,
    virtualTimeMs: 0,
    lastSurvivalDay: 0,
    nextSeq: 1,
    inventory: { ...STARTER_INVENTORY },
    foodCarry: 0,
    spoilageCarry: {},
    water: STARTER_VILLAGE_POOLS.water,
    starvationDays: 0,
    efficiencyPenalty: 0,
    starvationPopLoss: 0,
    isAbandoned: false,
    units: { ...DEFAULT_UNIT_COUNTS },
    unitTiers: { ...DEFAULT_UNIT_TIERS },
    marketEscrows: {},
    animals: { horse: 0, donkey: 0, goat: 0, sheep: 0, chicken: 0 },
    seedReserve: { grain: 0, roots: 0 },
    wall: { tier: 2, level: 0, status: 'none' },
    tileDetails: {},
    productionCarry: {},
    discoveredContinentTiles: {},
    unlockedTechs: mergedTechs,
    craftedCounts: {},
    buildings: [
      {
        instanceId: 'main-0',
        buildingId: 'main',
        x: center,
        y: center,
        tier: STARTER_VILLAGE_POOLS.mainTier,
        level: STARTER_VILLAGE_POOLS.mainLevel,
        status: 'active',
        condition: 100,
        graceDaysRemaining: BUILDING_DEGRADATION_GRACE_DAYS,
        arrivesAtMs: null,
        completedAtMs: null,
      },
    ],
    tasks: [],
    territoryFog: Array.from(territoryFog),
    continentFog: Array.from(continentFog),
    logs: [`Founded Stone Age Main Village Hall at (${center}, ${center}).`],
  };
}

/**
 * Advances due async tasks, lazy daily survival, tech triggers, and 3x3 fog reveals
 * up to `nextVirtualTimeMs` cleanly inside one pure state reducer step.
 *
 * @param {object} prev - Previous state snapshot.
 * @param {number} nextVirtualTimeMs - New virtual simulation clock timestamp.
 * @param {object} territory - Active Territory data grid.
 * @param {{ x: number, y: number }} spawnTile - Village coordinates on the Continent.
 * @returns {object} Resolved state snapshot.
 */
function advanceVillageSimulation(prev, nextVirtualTimeMs, territory, spawnTile, continent = null) {
  if (prev.isAbandoned) {
    return prev;
  }

  let inventory = { ...prev.inventory };
  let foodCarry = prev.foodCarry ?? 0;
  let spoilageCarry = { ...(prev.spoilageCarry ?? {}) };
  let water = prev.water;
  let units = { ...prev.units };
  let animals = { ...(prev.animals ?? { horse: 0, donkey: 0, goat: 0, sheep: 0, chicken: 0 }) };
  let wall = { ...(prev.wall ?? { tier: 2, level: 0, status: 'none' }) };
  let tileDetails = { ...(prev.tileDetails ?? {}) };
  let productionCarry = { ...(prev.productionCarry ?? {}) };
  const discoveredContinentTiles = { ...(prev.discoveredContinentTiles ?? {}) };
  let starvationDays = prev.starvationDays ?? 0;
  let efficiencyPenalty = prev.efficiencyPenalty ?? 0;
  let starvationPopLoss = prev.starvationPopLoss ?? 0;
  let isAbandoned = false;
  const craftedCounts = { ...prev.craftedCounts };
  const unlockedTechs = [...prev.unlockedTechs];
  let buildings = prev.buildings.map((b) => ({ ...b }));
  let territoryFog = new Uint8Array(prev.territoryFog);
  let continentFog = new Uint8Array(prev.continentFog);
  let nextSeq = prev.nextSeq;
  const newLogs = [];

  // 1. Resolve in-progress tasks chronologically.
  const nextTasks = [];
  const sortedTasks = [...prev.tasks].sort(
    (a, b) => (a.completedAtMs ?? a.returnsAtMs) - (b.completedAtMs ?? b.returnsAtMs),
  );

  for (const rawTask of sortedTasks) {
    const task = { ...rawTask };

    if (task.kind === 'build' && !task.resolvedBuild && nextVirtualTimeMs >= task.completedAtMs) {
      task.resolvedBuild = true;
      buildings = buildings.map((b) =>
        b.instanceId === task.instanceId ? { ...b, status: 'active' } : b,
      );
      const coordKey = `${task.x},${task.y}`;
      const builtTile = territory.tiles[task.y * prev.territorySize + task.x];
      let nextDetail = initializeTileDeposit(task.buildingId, builtTile, tileDetails[coordKey] ?? {});
      if (task.buildingId === 'crop_field' && !nextDetail.cropPlot) {
        nextDetail = { ...nextDetail, cropPlot: createEmptyCropPlot() };
      } else if (task.buildingId === 'orchard' && !nextDetail.orchardPlot) {
        nextDetail = { ...nextDetail, orchardPlot: createEmptyOrchardPlot() };
      }
      tileDetails[coordKey] = nextDetail;
      newLogs.push(`Completed ${BUILDINGS[task.buildingId].name} at (${task.x}, ${task.y}).`);
    }

    if (
      (task.kind === 'build' || task.kind === 'upgrade' || task.kind === 'upgrade_tier') &&
      (task.resolvedBuild || task.resolvedUpgrade || task.resolvedTierReset) &&
      !task.resolvedReturn &&
      nextVirtualTimeMs >= (task.returnsAtMs ?? task.completedAtMs)
    ) {
      task.resolvedReturn = true;
      const revealed = revealTerritoryBorderOnReturn({
        territoryFog,
        continentFog,
        territorySize: prev.territorySize,
        continentSize: prev.continentSize,
        x: task.x,
        y: task.y,
        spawnTile,
        newLogs,
      });
      territoryFog = revealed.territoryFog;
      continentFog = revealed.continentFog;
    }

    if (task.kind === 'upgrade' && !task.resolvedUpgrade && nextVirtualTimeMs >= task.completedAtMs) {
      task.resolvedUpgrade = true;
      buildings = buildings.map((b) =>
        b.instanceId === task.instanceId
          ? { ...b, level: task.targetLevel, status: 'active' }
          : b,
      );
      newLogs.push(`Upgraded ${BUILDINGS[task.buildingId].name} to Lv ${task.targetLevel}.`);
    }

    if (
      task.kind === 'upgrade_tier' &&
      !task.resolvedTierReset &&
      nextVirtualTimeMs >= task.completedAtMs
    ) {
      task.resolvedTierReset = true;
      buildings = buildings.map((b) =>
        b.instanceId === task.instanceId
          ? { ...b, tier: task.targetTier, level: 1, status: 'active' }
          : b,
      );
      newLogs.push(
        `Upgraded ${BUILDINGS[task.buildingId].name} to Tier ${task.targetTier} (reset to Lv 1).`,
      );
    }

    if (
      task.kind === 'upgrade_wall' &&
      !task.resolvedWall &&
      nextVirtualTimeMs >= task.completedAtMs
    ) {
      task.resolvedWall = true;
      wall = { tier: task.targetTier, level: task.targetLevel, status: 'active' };
      const bonus = getWallBonuses(wall);
      newLogs.push(
        `City Wall reached Tier ${wall.tier} Lv ${wall.level} (${bonus.defensePercent}% defense).`,
      );
    }

    if (
      task.kind === 'upgrade_main' &&
      !task.resolvedTier &&
      nextVirtualTimeMs >= task.completedAtMs
    ) {
      task.resolvedTier = true;
      buildings = buildings.map((b) =>
        b.buildingId === 'main' ? { ...b, tier: task.targetTier, status: 'active' } : b,
      );
      const ageName = AGES[task.targetTier - 1] ?? `Tier ${task.targetTier}`;
      newLogs.push(`Main Village Hall reached Tier ${task.targetTier} (${ageName} Age)!`);
    }

    if (
      task.kind === 'research' &&
      !task.resolvedResearch &&
      nextVirtualTimeMs >= task.completedAtMs
    ) {
      task.resolvedResearch = true;
      if (!unlockedTechs.includes(task.techId)) {
        unlockedTechs.push(task.techId);
      }
      newLogs.push(`Researched ${TECHNOLOGIES[task.techId].name}!`);
    }

    if (
      task.kind === 'train_unit' &&
      !task.resolvedTrain &&
      nextVirtualTimeMs >= task.completedAtMs
    ) {
      task.resolvedTrain = true;
      const qty = Math.max(1, Math.floor(task.quantity ?? 1));
      units[task.unitId] = (units[task.unitId] ?? 0) + qty;
      newLogs.push(`Recruited ${qty} ${UNITS[task.unitId]?.name ?? task.unitId}!`);
    }

    if (
      task.kind === 'craft' && !task.resolvedCraft && nextVirtualTimeMs >= task.completedAtMs) {
      task.resolvedCraft = true;
      const recipe = RECIPES[task.recipeId];
      const craftOutputs = task.outputs ?? recipe.outputs;
      const craftQty = Math.max(1, Math.floor(task.quantity ?? 1));
      const maxStorage = calculateStorageCapacity(buildings, inventory).totalCapacity;
      const added = addItemsWithinCapacity(inventory, craftOutputs, maxStorage);
      inventory = added.inventory;

      for (const [outId, outQty] of Object.entries(craftOutputs)) {
        craftedCounts[outId] = (craftedCounts[outId] ?? 0) + outQty;
      }

      if (recipe.unlocksTech && !unlockedTechs.includes(recipe.unlocksTech)) {
        if (isTechTriggerSatisfied(recipe.unlocksTech, { builtBuildings: buildings, craftedCounts })) {
          unlockedTechs.push(recipe.unlocksTech);
          newLogs.push(`Discovered ${TECHNOLOGIES[recipe.unlocksTech].name} trigger!`);
        }
      }
      newLogs.push(
        `Crafted ${craftQty > 1 ? `${craftQty}x ` : ''}${recipe.name}${added.dropped ? ' (storage full)' : ''}.`,
      );
    }

    if (
      task.kind === 'prospect' &&
      !task.resolvedReturn &&
      nextVirtualTimeMs >= (task.returnsAtMs ?? task.completedAtMs)
    ) {
      task.resolvedReturn = true;
      const coordKey = `${task.x},${task.y}`;
      tileDetails[coordKey] = { ...(tileDetails[coordKey] ?? {}), prospected: true };
      const revealed = revealTerritoryBorderOnReturn({
        territoryFog,
        continentFog,
        territorySize: prev.territorySize,
        continentSize: prev.continentSize,
        x: task.x,
        y: task.y,
        spawnTile,
        newLogs,
      });
      territoryFog = revealed.territoryFog;
      continentFog = revealed.continentFog;
      newLogs.push(`Prospector surveyed (${task.x}, ${task.y}) — right-click tile to view report.`);
    }

    if (
      task.kind === 'expedition' &&
      !task.resolvedReturn &&
      nextVirtualTimeMs >= (task.returnsAtMs ?? task.completedAtMs) &&
      continent
    ) {
      task.resolvedReturn = true;
      const targetTile = continent.tiles[task.toY * continent.size + task.toX];
      const rockInfo = ROCK_TYPES.find((r) => r.id === targetTile?.rockType);
      const rng = createPrng(hashCoords(prev.seed, task.toX, task.toY, nextSeq++));
      const outcome = resolveContinentExpedition({
        continentFog,
        continentSize: continent.size,
        targetTile,
        targetRockOres: rockInfo?.ores ?? [],
        units: task.units,
        rng,
      });
      continentFog = outcome.continentFog;
      discoveredContinentTiles[`${task.toX},${task.toY}`] = outcome.tileIntel;

      if (outcome.newlyRevealedCount > 0) {
        newLogs.push(`Scouts charted +${outcome.newlyRevealedCount} Continent tiles around (${task.toX}, ${task.toY}).`);
      }
      if (!outcome.intelOnly && Object.keys(outcome.itemsBroughtBack).length > 0) {
        const maxStorage = calculateStorageCapacity(buildings, inventory).totalCapacity;
        const added = addItemsWithinCapacity(inventory, outcome.itemsBroughtBack, maxStorage);
        inventory = added.inventory;
        const lootText = Object.entries(outcome.itemsBroughtBack)
          .map(([id, q]) => `+${q} ${RESOURCES[id]?.name ?? id}`)
          .join(', ');
        newLogs.push(`Expedition (${task.toX}, ${task.toY}) hauled: ${lootText}.`);
      } else {
        newLogs.push(
          `Expedition surveyed Continent (${task.toX}, ${task.toY}): ${outcome.tileIntel.rockType} (${outcome.tileIntel.availableOres.join(', ')}).`,
        );
      }
      if (outcome.capturedAnimal) {
        const penCap = calculateAnimalPenCapacity(buildings);
        const totalAnimals = Object.values(animals).reduce((s, q) => s + q, 0);
        if (totalAnimals < penCap) {
          animals = { ...animals, [outcome.capturedAnimal]: (animals[outcome.capturedAnimal] ?? 0) + 1 };
          newLogs.push(`Expedition captured 1 wild ${LIVESTOCK[outcome.capturedAnimal]?.name ?? outcome.capturedAnimal}!`);
        }
      }
    }

    // Team actions resolve loot and reveal 3x3 territory fog ONLY once returned to Main.
    if (
      task.kind === 'unit_action' &&
      !task.resolvedReturn &&
      nextVirtualTimeMs >= (task.returnsAtMs ?? task.completedAtMs)
    ) {
      task.resolvedReturn = true;
      const tile = territory.tiles[task.y * prev.territorySize + task.x];
      const rng = createPrng(hashCoords(prev.seed, task.x, task.y, nextSeq++));
      const outcome = resolveTeamActionYield({
        units: task.roleUnits ?? task.units ?? { [task.unitId]: 1 },
        action: task.action,
        tile,
        availableOres: territory.availableOres,
        unlockedTechs,
        efficiencyPenalty,
        rng,
      });

      const committed = task.units ?? { [task.unitId]: 1 };
      const teamLabel =
        (committed.gatherer ?? 0) > 0 && (committed.hunter ?? 0) > 0
          ? `${committed.gatherer}G + ${committed.hunter}H`
          : (committed.hunter ?? 0) > 0
            ? `${committed.hunter} Hunter(s)`
            : `${committed.gatherer ?? 1} Gatherer(s)`;

      const logParts = [];
      if (outcome.waterBowls > 0) {
        const maxWater = calculateWaterCapacity(buildings, inventory);
        water = Math.min(maxWater, water + outcome.waterBowls);
        logParts.push(`+${outcome.waterBowls} water bowls (${water}/${maxWater})`);
      }
      if (Object.keys(outcome.items).length > 0) {
        const maxStorage = calculateStorageCapacity(buildings, inventory).totalCapacity;
        const added = addItemsWithinCapacity(inventory, outcome.items, maxStorage);
        inventory = added.inventory;
        const summary = Object.entries(outcome.items)
          .map(([id, q]) => `+${q} ${RESOURCES[id]?.name ?? id}`)
          .join(', ');
        logParts.push(`${summary}${added.dropped ? ' (storage capped)' : ''}`);
      }

      if (outcome.encounter?.predator) {
        const predName = outcome.encounter.predator === 'bear' ? 'Bear' : 'Wolf';
        if (outcome.encounter.killedPredator) {
          newLogs.push(`Hunters slew a wild ${predName} in forest (${task.x}, ${task.y})!`);
        } else {
          newLogs.push(`Ambushed by a wild ${predName} in forest (${task.x}, ${task.y})!`);
        }
        const gLost = outcome.encounter.casualties?.gatherer ?? 0;
        const hLost = outcome.encounter.casualties?.hunter ?? 0;
        if (gLost > 0) {
          units.gatherer = Math.max(0, (units.gatherer ?? 0) - gLost);
          newLogs.push(`Lost ${gLost} Gatherer to the ${predName}!`);
        }
        if (hLost > 0) {
          units.hunter = Math.max(0, (units.hunter ?? 0) - hLost);
          newLogs.push(`Lost ${hLost} Hunter fighting the ${predName}!`);
        }
      }

      // Forest Hunting can capture live livestock when Farmstead + Animal Pen has free space & Spear unlocked.
      if ((committed.hunter ?? 0) > 0 && outcome.terrain === 'forest') {
        const hasFarm = buildings.some((b) => b.buildingId === 'farm' && b.status === 'active');
        const penCap = calculateAnimalPenCapacity(buildings);
        const totalAnimals = Object.values(animals).reduce((s, q) => s + q, 0);
        if (hasFarm && totalAnimals < penCap) {
          const cap = rollWildAnimalCapture({ unlockedTechs, rng });
          if (cap.captured && cap.animalId) {
            animals = { ...animals, [cap.animalId]: (animals[cap.animalId] ?? 0) + 1 };
            logParts.push(`captured 1 ${LIVESTOCK[cap.animalId]?.name ?? cap.animalId}`);
          }
        }
      }

      if (logParts.length === 0) {
        newLogs.push(`${teamLabel} returned from (${task.x}, ${task.y}) with nothing.`);
      } else {
        newLogs.push(`${teamLabel} returned from (${task.x}, ${task.y}): ${logParts.join(' · ')}.`);
      }

      const revealed = revealTerritoryBorderOnReturn({
        territoryFog,
        continentFog,
        territorySize: prev.territorySize,
        continentSize: prev.continentSize,
        x: task.x,
        y: task.y,
        spawnTile,
        newLogs,
      });
      territoryFog = revealed.territoryFog;
      continentFog = revealed.continentFog;
    }

    const finalDoneMs = task.returnsAtMs ?? task.completedAtMs;
    if (nextVirtualTimeMs < finalDoneMs) {
      nextTasks.push(task);
    }
  }

  // 1b. Continuous Tribal-Wars-style production (Mine, Timber Camp, Quarry, Clay Pit, Well).
  const deltaVirtualMs = Math.max(0, nextVirtualTimeMs - prev.virtualTimeMs);
  if (deltaVirtualMs > 0) {
    const prod = advanceContinuousProduction({
      buildings,
      territory,
      tileDetails,
      inventory,
      water,
      waterCapacity: calculateWaterCapacity(buildings, inventory),
      productionCarry,
      unlockedTechs,
      efficiencyPenalty,
      deltaVirtualMs,
    });
    inventory = prod.inventory;
    water = prod.water;
    tileDetails = prod.tileDetails;
    productionCarry = prod.productionCarry;
  }

  // 2. Apply daily FEFO auto-feeding, water consumption, livestock, crop/orchard ticks, fractional spoilage (S1),
  //    and 5-stage starvation/recovery day by day so multi-day catchups resolve cleanly.
  const currentDay = Math.floor(nextVirtualTimeMs / REAL_MS_PER_INGAME_DAY);
  let lastSurvivalDay = prev.lastSurvivalDay;
  if (currentDay > lastSurvivalDay) {
    const elapsedDays = currentDay - lastSurvivalDay;

    for (let dayOffset = 0; dayOffset < elapsedDays; dayOffset += 1) {
      if (isAbandoned) break;

      const dayCal = getCalendarState((lastSurvivalDay + dayOffset + 1) * REAL_MS_PER_INGAME_DAY);
      const ambientTempC = getAmbientTemperatureCelsius(spawnTile.temperature ?? 0.5, dayCal);
      tileDetails = advanceCropFieldsAndOrchards({
        buildings,
        tileDetails,
        ambientTempC,
        elapsedDays: 1,
      });

      const livestockTick = advanceDailyLivestock({ animals, inventory, water });
      inventory = livestockTick.inventory;
      water = livestockTick.water;
      if (Object.keys(livestockTick.produced).length > 0) {
        const maxStorage = calculateStorageCapacity(buildings, inventory).totalCapacity;
        inventory = addItemsWithinCapacity(inventory, livestockTick.produced, maxStorage).inventory;
      }

      const buildingMaxPop = calculateMaxPopulation(buildings);
      const popUsed = calculatePopUsed({ units, buildings, tasks: nextTasks });

      let hasDeficit = false;
      let foodDeficit = 0;
      let waterDeficit = 0;

      if (popUsed > 0) {
        const feed = consumeStoredFoodFEFO({
          inventory,
          foodCarry,
          foodNeeded: popUsed,
        });
        inventory = feed.inventory;
        foodCarry = feed.foodCarry;
        foodDeficit = feed.foodDeficit;

        waterDeficit = Math.max(0, popUsed - water);
        water = Math.max(0, water - popUsed);
        hasDeficit = feed.isStarving || waterDeficit > 0;
      }

      const spoilStep = applyDailySpoilage({
        inventory,
        spoilageCarry,
        elapsedDays: 1,
        buildings,
      });
      inventory = spoilStep.inventory;
      spoilageCarry = spoilStep.spoilageCarry;
      const spoiledEntries = Object.entries(spoilStep.spoiled);
      if (spoiledEntries.length > 0) {
        const spoiledText = spoiledEntries
          .map(([id, qty]) => `${qty} ${RESOURCES[id]?.name ?? id}`)
          .join(', ');
        newLogs.push(`Spoiled overnight: ${spoiledText}.`);
      }

      const wasAfflicted = efficiencyPenalty > 0 || starvationPopLoss > 0;
      const starvStep = advanceStarvationState({
        starvationDays,
        efficiencyPenalty,
        starvationPopLoss,
        isAbandoned,
        hasDeficit,
        buildingMaxPop,
        elapsedDays: 1,
      });
      starvationDays = starvStep.starvationDays;
      efficiencyPenalty = starvStep.efficiencyPenalty;
      starvationPopLoss = starvStep.starvationPopLoss;
      isAbandoned = starvStep.isAbandoned;

      if (hasDeficit) {
        const missing = `${foodDeficit > 0 ? 'Food' : ''}${foodDeficit > 0 && waterDeficit > 0 ? ' & ' : ''}${waterDeficit > 0 ? 'Water' : ''}`;
        newLogs.push(
          `${missing} shortage — ${starvStep.stage.label} (-${Math.round(efficiencyPenalty * 100)}% eff${starvationPopLoss > 0 ? `, -${starvationPopLoss} max pop` : ''}).`,
        );
      } else if (wasAfflicted) {
        newLogs.push(
          efficiencyPenalty === 0 && starvationPopLoss === 0
            ? 'Village fully fed and recovered to Healthy!'
            : `Village fed — recovering (${starvStep.stage.label}, -${Math.round(efficiencyPenalty * 100)}% eff).`,
        );
      }

      if (isAbandoned) {
        newLogs.push('Max population fell to 0 — your village has become abandoned!');
        break;
      }

      const curPopUsed = calculatePopUsed({ units, buildings });
      if (curPopUsed > starvStep.effectiveMaxPop) {
        const trimRes = trimUnitsBalanced(units, curPopUsed - starvStep.effectiveMaxPop);
        units = trimRes.units;
        if (trimRes.trimmedTotal > 0) {
          newLogs.push(`Lost ${trimRes.trimmedTotal} villager(s) due to famine population decline.`);
        }
      }

      const degradeStep = advanceDailyBuildingDegradation({
        buildings,
        wall,
        season: dayCal.season,
        elapsedDays: 1,
      });
      buildings = degradeStep.buildings;
      if (degradeStep.abandonedByDegradation && !isAbandoned) {
        isAbandoned = true;
        newLogs.push(
          `Average building condition fell to ${degradeStep.averageCondition}% (< 20%) — village abandoned!`,
        );
        break;
      }
    }

    lastSurvivalDay = currentDay;
  }

  const combinedLogs = newLogs.length > 0 ? [...newLogs.reverse(), ...prev.logs].slice(0, 24) : prev.logs;

  return {
    ...prev,
    virtualTimeMs: isAbandoned ? nextVirtualTimeMs : nextVirtualTimeMs,
    lastSurvivalDay,
    nextSeq,
    inventory,
    foodCarry,
    spoilageCarry,
    water,
    units,
    animals,
    wall,
    tileDetails,
    productionCarry,
    discoveredContinentTiles,
    starvationDays,
    efficiencyPenalty,
    starvationPopLoss,
    isAbandoned,
    unlockedTechs,
    craftedCounts,
    buildings,
    tasks: isAbandoned ? [] : nextTasks,
    territoryFog: Array.from(territoryFog),
    continentFog: Array.from(continentFog),
    logs: combinedLogs,
  };
}

/**
 * Loads initial state safely from `localStorage`, falling back when world params change.
 *
 * @param {string} storageKey - LocalStorage bucket key ('online' vs 'sandbox').
 * @param {object} worldParams - Current seed, spawnTile, and grid dimensions.
 * @returns {object} Validated village state.
 */
function loadSavedOrFreshState(storageKey, worldParams) {
  const spawnKey = `${worldParams.spawnTile.x},${worldParams.spawnTile.y}`;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.seed === worldParams.seed &&
        parsed.spawnKey === spawnKey &&
        parsed.continentSize === worldParams.continentSize &&
        parsed.territorySize === worldParams.territorySize &&
        Array.isArray(parsed.territoryFog) &&
        parsed.territoryFog.length === worldParams.territorySize * worldParams.territorySize
      ) {
        return {
          ...parsed,
          foodCarry: parsed.foodCarry ?? 0,
          spoilageCarry: parsed.spoilageCarry ?? {},
          starvationDays: parsed.starvationDays ?? 0,
          efficiencyPenalty: parsed.efficiencyPenalty ?? 0,
          starvationPopLoss: parsed.starvationPopLoss ?? 0,
          isAbandoned: Boolean(parsed.isAbandoned),
          units: {
            ...DEFAULT_UNIT_COUNTS,
            ...(parsed.units ?? {}),
          },
          unitTiers: {
            ...DEFAULT_UNIT_TIERS,
            ...(parsed.unitTiers ?? {}),
          },
          marketEscrows: parsed.marketEscrows ?? {},
          unlockedTechs: [
            ...new Set([
              ...STARTER_UNLOCKED_TECHS,
              ...(parsed.unlockedTechs ?? []),
              ...(worldParams.globalUnlockedTechs ?? []),
            ]),
          ],
          animals: {
            horse: 0,
            donkey: 0,
            goat: 0,
            sheep: 0,
            chicken: 0,
            ...(parsed.animals ?? {}),
          },
          seedReserve: {
            grain: parsed.seedReserve?.grain ?? 0,
            roots: (parsed.seedReserve?.roots ?? 0) + (parsed.seedReserve?.seeds ?? 0),
          },
          wall: parsed.wall ?? { tier: 2, level: 0, status: 'none' },
          tileDetails: parsed.tileDetails ?? {},
          productionCarry: parsed.productionCarry ?? {},
          discoveredContinentTiles: parsed.discoveredContinentTiles ?? {},
          buildings: (parsed.buildings ?? []).map((b) => ({
            condition: 100,
            graceDaysRemaining: BUILDING_DEGRADATION_GRACE_DAYS,
            ...b,
          })),
          sessionKey: worldParams.sessionKey,
        };
      }
    }
  } catch {
    // Ignore corrupted storage entries and initialize fresh village state cleanly.
  }
  return createInitialState(worldParams);
}

/**
 * React state hook managing Stone Age village simulation, timers, buildings,
 * unit dispatches, tech triggers, 3x3 fog expansion, and localStorage persistence.
 *
 * @param {object} params
 * @param {string} params.storageKey - Distinct storage bucket key ('online' vs 'sandbox').
 * @param {string} params.seed - World seed.
 * @param {{ x: number, y: number }} params.spawnTile - Starter Continent coordinates.
 * @param {number} params.continentSize - Continent grid dimension.
 * @param {object} params.territory - Generated home Territory object.
 * @param {number | null} [params.fixedSpeedFactor=null] - Locks simulation speed (e.g., 6 in Offline mode).
 * @returns {object} Village state, computed HUD metrics, and action dispatchers.
 */
export function useStoneAgeVillage({
  storageKey,
  seed,
  spawnTile,
  continentSize,
  territory,
  continent = null,
  fixedSpeedFactor = null,
  marketStorageKey = null,
  globalUnlockedTechs = null,
}) {
  const globalTechStorageKey = useMemo(
    () => (marketStorageKey ? `${marketStorageKey}:techs` : null),
    [marketStorageKey],
  );
  const readGlobalTechs = useCallback(() => {
    const base = new Set([...STARTER_UNLOCKED_TECHS, ...(globalUnlockedTechs ?? [])]);
    if (globalTechStorageKey) {
      try {
        const raw = window.localStorage.getItem(globalTechStorageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) parsed.forEach((t) => base.add(t));
      } catch {
        // Ignore storage read errors cleanly.
      }
    }
    return [...base];
  }, [globalUnlockedTechs, globalTechStorageKey]);

  const sessionKey = `${storageKey}|${seed}|${spawnTile.x},${spawnTile.y}|${continentSize}|${territory.size}`;
  const worldParams = useMemo(
    () => ({
      sessionKey,
      seed,
      spawnTile,
      continentSize,
      territorySize: territory.size,
      globalUnlockedTechs: readGlobalTechs(),
    }),
    [sessionKey, seed, spawnTile, continentSize, territory.size, readGlobalTechs],
  );

  const [rawState, setRawState] = useState(() => loadSavedOrFreshState(storageKey, worldParams));
  const [marketOffers, setMarketOffers] = useState(() => loadMarketOffers(marketStorageKey));
  const lastWallClockRef = useRef(0);

  // Derive active session state without unmounting sibling controls on seed/tile changes.
  const state = useMemo(
    () =>
      rawState.sessionKey === sessionKey
        ? rawState
        : loadSavedOrFreshState(storageKey, worldParams),
    [rawState, sessionKey, storageKey, worldParams],
  );

  const updateSessionState = useCallback(
    (updater) => {
      setRawState((prev) => {
        const base =
          prev.sessionKey === sessionKey ? prev : loadSavedOrFreshState(storageKey, worldParams);
        return updater(base);
      });
    },
    [sessionKey, storageKey, worldParams],
  );

  // Persist snapshots & shared global unlocked technologies cleanly into localStorage.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
      if (globalTechStorageKey) {
        const merged = [...new Set([...readGlobalTechs(), ...state.unlockedTechs])];
        window.localStorage.setItem(globalTechStorageKey, JSON.stringify(merged));
      }
    } catch {
      // Ignore quota or disabled-storage errors gracefully.
    }
  }, [storageKey, state, globalTechStorageKey, readGlobalTechs]);

  const syncMarketDeliveries = useCallback(
    (clockMs, activeKey) => {
      if (!marketStorageKey) return;
      const offers = loadMarketOffers(marketStorageKey);
      let anyChanged = false;
      const buyerCredits = [];
      const sellerCredits = [];

      const nextOffers = offers.map((offer) => {
        if (offer.status !== 'in_transit') return offer;
        let updated = { ...offer };

        if (!updated.buyerDelivered && clockMs >= updated.arrivesAtMs) {
          updated.buyerDelivered = true;
          anyChanged = true;
          const buyerLog = `Caravan Trade arrived from (${updated.sellerCoords.x}, ${updated.sellerCoords.y}): +${updated.offerQty} ${RESOURCES[updated.offerId]?.name ?? updated.offerId}.`;
          if (updated.buyerStorageKey === activeKey) {
            buyerCredits.push({ offer: updated, log: buyerLog });
          } else {
            creditInactiveTerritoryInStorage({
              targetStorageKey: updated.buyerStorageKey,
              itemId: updated.offerId,
              qty: updated.offerQty,
              logMessage: buyerLog,
            });
          }
        }

        if (!updated.sellerDelivered && clockMs >= updated.returnsAtMs) {
          updated.sellerDelivered = true;
          updated.status = 'completed';
          anyChanged = true;
          const sellerLog = `Trade Caravan returned from (${updated.buyerCoords.x}, ${updated.buyerCoords.y}): +${updated.requestQty} ${RESOURCES[updated.requestId]?.name ?? updated.requestId}.`;
          if (updated.sellerStorageKey === activeKey) {
            sellerCredits.push({ offer: updated, log: sellerLog });
          } else {
            creditInactiveTerritoryInStorage({
              targetStorageKey: updated.sellerStorageKey,
              itemId: updated.requestId,
              qty: updated.requestQty,
              escrowOfferIdToClear: updated.id,
              logMessage: sellerLog,
            });
          }
        }
        return updated;
      });

      if (!anyChanged) return;
      saveMarketOffers(marketStorageKey, nextOffers);
      setMarketOffers(nextOffers);

      if (buyerCredits.length > 0 || sellerCredits.length > 0) {
        updateSessionState((prev) => {
          let nextInv = { ...prev.inventory };
          const nextEscrows = { ...(prev.marketEscrows ?? {}) };
          const addLogs = [];
          const maxCap = calculateStorageCapacity(prev.buildings, nextInv).totalCapacity;

          for (const entry of buyerCredits) {
            nextInv = addItemsWithinCapacity(
              nextInv,
              { [entry.offer.offerId]: entry.offer.offerQty },
              maxCap,
            ).inventory;
            addLogs.push(entry.log);
          }
          for (const entry of sellerCredits) {
            nextInv = addItemsWithinCapacity(
              nextInv,
              { [entry.offer.requestId]: entry.offer.requestQty },
              maxCap,
            ).inventory;
            delete nextEscrows[entry.offer.id];
            addLogs.push(entry.log);
          }
          return {
            ...prev,
            inventory: nextInv,
            marketEscrows: nextEscrows,
            logs: [...addLogs, ...prev.logs].slice(0, 24),
          };
        });
      }
    },
    [marketStorageKey, updateSessionState],
  );

  // 250ms simulation tick scaling real delta by (effectiveSpeedFactor / 6).
  useEffect(() => {
    lastWallClockRef.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const realDeltaMs = Math.max(0, now - lastWallClockRef.current);
      lastWallClockRef.current = now;

      let settledClockMs = 0;
      const sharedTechs = readGlobalTechs();
      updateSessionState((prev) => {
        const activeSpeed = fixedSpeedFactor ?? prev.speedFactor;
        const virtualDeltaMs = realDeltaMs * (activeSpeed / 6);
        const nextClock = prev.virtualTimeMs + virtualDeltaMs;
        settledClockMs = nextClock;
        const mergedBase =
          sharedTechs.some((t) => !prev.unlockedTechs.includes(t))
            ? { ...prev, unlockedTechs: [...new Set([...prev.unlockedTechs, ...sharedTechs])] }
            : prev;
        return advanceVillageSimulation(
          mergedBase,
          nextClock,
          territory,
          spawnTile,
          continent,
        );
      });
      if (marketStorageKey && settledClockMs > 0) {
        syncMarketDeliveries(settledClockMs, storageKey);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    updateSessionState,
    territory,
    spawnTile,
    continent,
    fixedSpeedFactor,
    marketStorageKey,
    storageKey,
    syncMarketDeliveries,
    readGlobalTechs,
  ]);

  const calendar = useMemo(() => getCalendarState(state.virtualTimeMs), [state.virtualTimeMs]);
  const territoryFogMask = useMemo(() => new Uint8Array(state.territoryFog), [state.territoryFog]);
  const continentFogMask = useMemo(() => new Uint8Array(state.continentFog), [state.continentFog]);

  const mainBuilding = state.buildings.find((b) => b.buildingId === 'main') ?? state.buildings[0];
  const storageProfile = calculateStorageCapacity(state.buildings, state.inventory);
  const storageCapacity = storageProfile.totalCapacity;
  const preservedFoodCapacity = storageProfile.preservedFoodCapacity;
  const storageUsed = calculateStorageUsed(state.inventory);
  const storedFood = calculateTotalStoredFood(state.inventory, state.foodCarry ?? 0);
  const waterCapacity = calculateWaterCapacity(state.buildings, state.inventory);
  const effectiveSpeedFactor = fixedSpeedFactor ?? state.speedFactor;
  const buildingMaxPop = calculateMaxPopulation(state.buildings);
  const maxPop = state.isAbandoned
    ? 0
    : Math.max(0, buildingMaxPop - (state.starvationPopLoss ?? 0));
  const popUsed = calculatePopUsed({ units: state.units, buildings: state.buildings, tasks: state.tasks });
  const starvationStage = getStarvationStageInfo({
    starvationDays: state.starvationDays ?? 0,
    efficiencyPenalty: state.efficiencyPenalty ?? 0,
    starvationPopLoss: state.starvationPopLoss ?? 0,
    isAbandoned: Boolean(state.isAbandoned),
  });

  const busyUnits = useMemo(
    () => calculateBusyUnits(state.tasks, state.marketEscrows),
    [state.tasks, state.marketEscrows],
  );

  const freeUnits = useMemo(() => {
    const out = {};
    for (const unitId of Object.keys(UNITS)) {
      out[unitId] = Math.max(0, (state.units[unitId] ?? 0) - (busyUnits[unitId] ?? 0));
    }
    return out;
  }, [state.units, busyUnits]);

  const farmSeedCapacity = calculateFarmSeedCapacity(state.buildings);
  const farmMaxAttachments = calculateFarmMaxAttachments(state.buildings);
  const farmAttachmentsUsed = state.buildings.filter(
    (b) => b.buildingId === 'crop_field' || b.buildingId === 'animal_pen' || b.buildingId === 'orchard',
  ).length;
  const animalPenCapacity = calculateAnimalPenCapacity(state.buildings);
  const wallBonuses = getWallBonuses(state.wall);

  const setSpeedFactor = useCallback(
    (nextSpeed) => {
      if (fixedSpeedFactor !== null) return;
      updateSessionState((prev) => ({ ...prev, speedFactor: Number(nextSpeed) }));
    },
    [updateSessionState, fixedSpeedFactor],
  );

  const resetVillage = useCallback(() => {
    setRawState(createInitialState(worldParams));
  }, [worldParams]);

  const trainUnit = useCallback(
    (unitId, buildingInstanceId = null) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const unitDef = UNITS[unitId];
        if (!unitDef) return prev;
        if (unitId === 'prospector' && !prev.unlockedTechs.includes('bone_pickaxe')) return prev;
        if (!unitDef.requiredTechs.every((t) => prev.unlockedTechs.includes(t))) return prev;
        const main = prev.buildings.find((b) => b.buildingId === 'main');
        if ((main?.tier ?? 1) < unitDef.tier) return prev;
        if (!Object.entries(unitDef.requiredAnimal ?? {}).every(([a, q]) => (prev.animals?.[a] ?? 0) >= q)) {
          return prev;
        }

        const curMaxPop = Math.max(
          0,
          calculateMaxPopulation(prev.buildings) - (prev.starvationPopLoss ?? 0),
        );
        const curPopUsed = calculatePopUsed({
          units: prev.units,
          buildings: prev.buildings,
          tasks: prev.tasks,
        });
        if (curPopUsed + unitDef.popCost > curMaxPop) return prev;

        const nextTiers = { ...(prev.unitTiers ?? DEFAULT_UNIT_TIERS) };
        if (
          unitDef.upgradeTechs?.length > 0 &&
          (prev.units[unitId] ?? 0) === 0 &&
          unitDef.upgradeTechs.every((t) => prev.unlockedTechs.includes(t))
        ) {
          nextTiers[unitId] = 3;
        }

        const unitCost = getUnitTrainingCost(unitId, prev.unlockedTechs, nextTiers);
        if (!hasEnoughResources(prev.inventory, unitCost)) return prev;

        const nextAnimals = { ...(prev.animals ?? {}) };
        for (const [aId, qty] of Object.entries(unitDef.requiredAnimal ?? {})) {
          nextAnimals[aId] = Math.max(0, (nextAnimals[aId] ?? 0) - qty);
        }

        const trainHours = unitDef.trainingTimeHours ?? 0;
        if (trainHours <= 0) {
          return {
            ...prev,
            inventory: spendResources(prev.inventory, unitCost),
            animals: nextAnimals,
            unitTiers: nextTiers,
            units: {
              ...prev.units,
              [unitId]: (prev.units[unitId] ?? 0) + 1,
            },
            logs: [`Trained 1 ${unitDef.name} (${curPopUsed + unitDef.popCost}/${curMaxPop} pop).`, ...prev.logs].slice(0, 24),
          };
        }

        const targetBld =
          (buildingInstanceId &&
            prev.buildings.find((b) => b.instanceId === buildingInstanceId && b.status === 'active')) ||
          prev.buildings.find((b) => b.buildingId === unitDef.trainedAt && b.status === 'active') ||
          main;
        const effMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
        const trainMs = Math.round((trainHours / effMult) * REAL_MS_PER_INGAME_HOUR);

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, unitCost),
          animals: nextAnimals,
          unitTiers: nextTiers,
          tasks: [
            ...prev.tasks,
            {
              id: `trn-${prev.nextSeq}`,
              kind: 'train_unit',
              unitId,
              buildingInstanceId: targetBld?.instanceId ?? null,
              quantity: 1,
              cost: { ...unitCost },
              animalsSpent: { ...(unitDef.requiredAnimal ?? {}) },
              startedAtMs: prev.virtualTimeMs,
              completedAtMs: prev.virtualTimeMs + trainMs,
              resolvedTrain: false,
            },
          ],
          logs: [`Recruiting 1 ${unitDef.name} (${curPopUsed + unitDef.popCost}/${curMaxPop} pop).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const refitUnitTier = useCallback(
    (unitId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const unitDef = UNITS[unitId];
        if (!unitDef) return prev;
        const currentCount = prev.units?.[unitId] ?? 0;
        const currentUnitTier = prev.unitTiers?.[unitId] ?? 2;
        const rule = getUnitRefitRule({
          unitId,
          currentCount,
          currentUnitTier,
          unlockedTechs: prev.unlockedTechs,
          inventory: prev.inventory,
        });
        if (!rule.allowed) return prev;

        return {
          ...prev,
          inventory: spendResources(prev.inventory, rule.cost),
          unitTiers: {
            ...(prev.unitTiers ?? DEFAULT_UNIT_TIERS),
            [unitId]: rule.targetTier,
          },
          logs: [
            `Refitted ${currentCount} ${unitDef.name} division(s) to Bronze Tier.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const dismissUnit = useCallback(
    (unitId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const unitDef = UNITS[unitId];
        if (!unitDef) return prev;

        const busy = calculateBusyUnits(prev.tasks, prev.marketEscrows);
        const currentCount = prev.units?.[unitId] ?? 0;
        const freeCount = Math.max(0, currentCount - (busy[unitId] ?? 0));
        if (freeCount < 1) return prev;

        const nextUnits = {
          ...prev.units,
          [unitId]: currentCount - 1,
        };
        const curMaxPop = Math.max(
          0,
          calculateMaxPopulation(prev.buildings) - (prev.starvationPopLoss ?? 0),
        );
        const nextPopUsed = calculatePopUsed({ units: nextUnits, buildings: prev.buildings });

        return {
          ...prev,
          units: nextUnits,
          logs: [
            `Dispensed 1 ${unitDef.name} (${nextPopUsed}/${curMaxPop} pop).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const removeResource = useCallback(
    (resourceId, amount = 1) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const res = RESOURCES[resourceId];
        const qtyToRemove = Math.floor(Number(amount));
        const available = prev.inventory[resourceId] ?? 0;
        if (!res || !Number.isFinite(qtyToRemove) || qtyToRemove <= 0 || available <= 0) {
          return prev;
        }

        const removed = Math.min(available, qtyToRemove);
        const remaining = available - removed;
        const nextInventory = { ...prev.inventory };
        if (remaining <= 0) {
          delete nextInventory[resourceId];
        } else {
          nextInventory[resourceId] = remaining;
        }

        return {
          ...prev,
          inventory: nextInventory,
          logs: [`Removed ${removed} ${res.name} from stockpile.`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const dispatchTileAction = useCallback(
    ({ action, x, y, units }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        if (prev.territoryFog[y * prev.territorySize + x] !== 1) return prev;
        const tile = territory.tiles[y * prev.territorySize + x];
        if (action === 'collect_water' && !tile?.isWater) return prev;

        const defaultUnits =
          action === 'hunt' ? { gatherer: 0, hunter: 1 } : { gatherer: 1, hunter: 0 };

        let reqGatherers;
        let reqHunters;
        let roleUnits;

        let busyGatherers = 0;
        let busyHunters = 0;
        for (const t of prev.tasks) {
          if (t.kind === 'unit_action') {
            busyGatherers += t.units ? (t.units.gatherer ?? 0) : t.unitId === 'gatherer' ? 1 : 0;
            busyHunters += t.units ? (t.units.hunter ?? 0) : t.unitId === 'hunter' ? 1 : 0;
          }
        }
        const availG = Math.max(0, (prev.units.gatherer ?? 0) - busyGatherers);
        const availH = Math.max(0, (prev.units.hunter ?? 0) - busyHunters);

        if (action === 'team') {
          const teamG = Math.max(0, Math.floor(units?.gatherer ?? 0));
          const teamH = Math.max(0, Math.floor(units?.hunter ?? 0));
          const teamW = Math.max(0, Math.floor(units?.water ?? 0));
          if (teamG + teamH + teamW < 1) return prev;
          if (teamW > 0 && !tile?.isWater) return prev;
          if (teamG > availG || teamH > availH) return prev;

          const extraG = Math.min(availG - teamG, teamW);
          const extraH = Math.min(availH - teamH, teamW - extraG);
          if (extraG + extraH < teamW) return prev;

          reqGatherers = teamG + extraG;
          reqHunters = teamH + extraH;
          roleUnits = { gatherer: teamG, hunter: teamH, water: teamW };
        } else if (action === 'collect_water') {
          const requestedTotal = Math.max(
            0,
            Math.floor((units?.water ?? 0) || (units?.gatherer ?? 0) + (units?.hunter ?? 0) || 1),
          );
          if (units && (units.gatherer !== undefined || units.hunter !== undefined) && !units.water) {
            reqGatherers = Math.max(0, Math.floor(units.gatherer ?? 0));
            reqHunters = Math.max(0, Math.floor(units.hunter ?? 0));
          } else {
            reqGatherers = Math.min(availG, requestedTotal);
            reqHunters = Math.min(availH, requestedTotal - reqGatherers);
          }
          if (reqGatherers + reqHunters < 1) return prev;
          roleUnits = { gatherer: reqGatherers, hunter: reqHunters };
        } else {
          reqGatherers = Math.max(0, Math.floor(units?.gatherer ?? defaultUnits.gatherer));
          reqHunters = Math.max(0, Math.floor(units?.hunter ?? defaultUnits.hunter));
          if (action === 'gather' && reqGatherers < 1) return prev;
          if (action === 'hunt' && reqHunters < 1) return prev;
          roleUnits = { gatherer: reqGatherers, hunter: reqHunters };
        }

        if (reqGatherers > availG || reqHunters > availH) return prev;

        const committedUnits = { gatherer: reqGatherers, hunter: reqHunters };
        const teamType =
          reqGatherers > 0 && reqHunters > 0
            ? 'mixed'
            : reqHunters > 0
              ? 'hunter'
              : 'gatherer';

        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const timing = calculateTeamActionTimestamps({
          from: { x: main.x, y: main.y },
          to: { x, y },
          units: committedUnits,
          unlockedTechs: prev.unlockedTechs,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });

        const task = {
          id: `act-${prev.nextSeq}`,
          kind: 'unit_action',
          unitId: teamType === 'hunter' ? 'hunter' : 'gatherer',
          units: committedUnits,
          roleUnits,
          teamType,
          action,
          x,
          y,
          startedAtMs: prev.virtualTimeMs,
          arrivesAtMs: timing.arrivesAtMs,
          completedAtMs: timing.workCompletedAtMs,
          returnsAtMs: timing.returnsAtMs,
          resolvedReturn: false,
        };

        const teamDesc =
          teamType === 'mixed'
            ? `${reqGatherers}G + ${reqHunters}H`
            : teamType === 'hunter'
              ? `${reqHunters} Hunter(s)`
              : `${reqGatherers} Gatherer(s)`;

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          tasks: [...prev.tasks, task],
          logs: [`Dispatched ${teamDesc} (${action}) to (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState, territory],
  );

  const evaluateBuildingOptions = useCallback(
    (x, y) => {
      const idx = y * territory.size + x;
      const tile = territory.tiles[idx];
      const isExplored = state.territoryFog[idx] === 1;
      const occupied = state.buildings.some((b) => b.x === x && b.y === y);
      const curMainTier = mainBuilding?.tier ?? 1;

      return Object.values(BUILDINGS)
        .filter((def) => def.buildable)
        .map((def) => {
          if (state.isAbandoned) {
            return { building: def, status: 'red', reason: 'Village is abandoned.' };
          }
          if (!isExplored) {
            return { building: def, status: 'red', reason: 'Tile is unexplored.' };
          }
          if (!tile?.buildable) {
            return { building: def, status: 'red', reason: 'Terrain is unbuildable.' };
          }
          if (occupied) {
            return { building: def, status: 'red', reason: 'Tile already occupied.' };
          }
          const rule = canBuildOrUpgradeBuilding({
            buildingId: def.id,
            currentLevel: 0,
            targetLevel: 1,
            mainTier: curMainTier,
            unlockedTechs: state.unlockedTechs,
          });
          if (!rule.allowed) {
            return { building: def, status: 'red', reason: rule.reason };
          }
          const placement = validateBuildingPlacement({
            buildingId: def.id,
            x,
            y,
            territory,
            buildings: state.buildings,
          });
          if (!placement.allowed) {
            return { building: def, status: 'red', reason: placement.reason };
          }
          if (
            def.maxCount !== null &&
            state.buildings.filter((b) => b.buildingId === def.id).length >= def.maxCount
          ) {
            return { building: def, status: 'red', reason: `Limit ${def.maxCount} reached.` };
          }
          if (freeUnits.builder < def.buildersRequired) {
            return {
              building: def,
              status: 'red',
              reason: `Needs ${def.buildersRequired} free Builder (train at Main).`,
            };
          }
          if (popUsed + def.workersRequired > maxPop) {
            return {
              building: def,
              status: 'red',
              reason: `Needs ${def.workersRequired} free population slot.`,
            };
          }
          if (!hasEnoughResources(state.inventory, def.cost)) {
            return {
              building: def,
              status: 'grey',
              reason: 'Insufficient resources.',
            };
          }
          return { building: def, status: 'ready', reason: null };
        });
    },
    [
      territory,
      state.territoryFog,
      state.buildings,
      state.unlockedTechs,
      state.inventory,
      state.isAbandoned,
      mainBuilding,
      freeUnits.builder,
      popUsed,
      maxPop,
    ],
  );

  const startBuildBuilding = useCallback(
    ({ buildingId, x, y }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const def = BUILDINGS[buildingId];
        if (!def || !def.buildable) return prev;
        const idx = y * territory.size + x;
        const tile = territory.tiles[idx];
        if (!tile?.buildable || prev.territoryFog[idx] !== 1) return prev;
        if (prev.buildings.some((b) => b.x === x && b.y === y)) return prev;

        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const perm = canBuildOrUpgradeBuilding({
          buildingId,
          currentLevel: 0,
          targetLevel: 1,
          mainTier: main.tier,
          unlockedTechs: prev.unlockedTechs,
        });
        if (!perm.allowed) return prev;

        const placement = validateBuildingPlacement({
          buildingId,
          x,
          y,
          territory,
          buildings: prev.buildings,
        });
        if (!placement.allowed) return prev;
        if (
          def.maxCount !== null &&
          prev.buildings.filter((b) => b.buildingId === buildingId).length >= def.maxCount
        ) {
          return prev;
        }

        const busyBuilders = prev.tasks
          .filter(
            (t) =>
              t.kind === 'build' ||
              t.kind === 'upgrade' ||
              t.kind === 'upgrade_main' ||
              t.kind === 'upgrade_tier' ||
              t.kind === 'upgrade_wall',
          )
          .reduce((s, t) => s + (t.buildersUsed ?? 1), 0);
        if ((prev.units.builder ?? 0) - busyBuilders < def.buildersRequired) return prev;

        const curMaxPop = Math.max(
          0,
          calculateMaxPopulation(prev.buildings) - (prev.starvationPopLoss ?? 0),
        );
        const curPopUsed = calculatePopUsed({
          units: prev.units,
          buildings: prev.buildings,
          tasks: prev.tasks,
        });
        if (curPopUsed + def.workersRequired > curMaxPop) return prev;
        if (!hasEnoughResources(prev.inventory, def.cost)) return prev;

        const timing = calculateBuildTimestamps({
          from: { x: main.x, y: main.y },
          to: { x, y },
          buildingId,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });

        const instanceId = `${buildingId}-${prev.nextSeq}`;
        const newBuilding = {
          instanceId,
          buildingId,
          x,
          y,
          tier: perm.spawnTier,
          level: 1,
          status: 'constructing',
          condition: 100,
          graceDaysRemaining: BUILDING_DEGRADATION_GRACE_DAYS,
          arrivesAtMs: timing.arrivesAtMs,
          completedAtMs: timing.completedAtMs,
        };

        const task = {
          id: `bld-${prev.nextSeq}`,
          kind: 'build',
          buildingId,
          instanceId,
          x,
          y,
          targetTier: perm.spawnTier,
          targetLevel: 1,
          buildersUsed: def.buildersRequired,
          cost: { ...def.cost },
          startedAtMs: prev.virtualTimeMs,
          arrivesAtMs: timing.arrivesAtMs,
          completedAtMs: timing.completedAtMs,
          returnsAtMs: timing.builderAvailableAtMs,
          resolvedBuild: false,
        };

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, def.cost),
          buildings: [...prev.buildings, newBuilding],
          tasks: [...prev.tasks, task],
          logs: [`Started building ${def.name} at (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState, territory],
  );

  const startUpgradeBuilding = useCallback(
    (instanceId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const target = prev.buildings.find((b) => b.instanceId === instanceId);
        const hasPendingUpgrade = prev.tasks.some(
          (t) =>
            (t.kind === 'upgrade' || t.kind === 'upgrade_tier' || t.kind === 'upgrade_main') &&
            t.instanceId === instanceId,
        );
        if (!target || target.status !== 'active' || hasPendingUpgrade) return prev;
        const def = BUILDINGS[target.buildingId];
        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const nextLevel = target.level + 1;
        const perm = canBuildOrUpgradeBuilding({
          buildingId: target.buildingId,
          currentLevel: target.level,
          targetLevel: nextLevel,
          buildingTier: target.tier,
          mainTier: main.tier,
          unlockedTechs: prev.unlockedTechs,
        });
        if (!perm.allowed) return prev;

        const upgradeCost = Object.fromEntries(
          Object.entries(def.cost).map(([id, q]) => [id, q * (target.tier ?? def.tier) * nextLevel]),
        );
        if (!hasEnoughResources(prev.inventory, upgradeCost)) return prev;

        const busyBuilders = prev.tasks
          .filter(
            (t) =>
              t.kind === 'build' ||
              t.kind === 'upgrade' ||
              t.kind === 'upgrade_main' ||
              t.kind === 'upgrade_tier' ||
              t.kind === 'upgrade_wall',
          )
          .reduce((s, t) => s + (t.buildersUsed ?? 1), 0);
        const buildersNeeded = Math.max(1, def.buildersRequired);
        if ((prev.units.builder ?? 0) - busyBuilders < buildersNeeded) return prev;

        const timing = calculateBuildTimestamps({
          from: { x: main.x, y: main.y },
          to: { x: target.x, y: target.y },
          buildingId: target.buildingId,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });

        const task = {
          id: `upg-${prev.nextSeq}`,
          kind: 'upgrade',
          buildingId: target.buildingId,
          instanceId,
          x: target.x,
          y: target.y,
          targetLevel: nextLevel,
          buildersUsed: buildersNeeded,
          cost: upgradeCost,
          startedAtMs: prev.virtualTimeMs,
          arrivesAtMs: timing.arrivesAtMs,
          completedAtMs: timing.completedAtMs,
          returnsAtMs: timing.builderAvailableAtMs,
          resolvedUpgrade: false,
        };

        // Keep existing buildings active during upgrades so storage, housing, and workshops remain usable.
        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, upgradeCost),
          tasks: [...prev.tasks, task],
          logs: [`Upgrading ${def.name} to Lv ${nextLevel}.`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const changeMainTier = useCallback(
    (targetTier) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const hasPendingUpgrade = prev.tasks.some(
          (t) =>
            (t.kind === 'upgrade' || t.kind === 'upgrade_tier' || t.kind === 'upgrade_main') &&
            t.instanceId === main?.instanceId,
        );
        if (!main || main.status !== 'active' || hasPendingUpgrade) return prev;
        const rule = getMainTierChangeRule({
          currentMainTier: main.tier,
          targetMainTier: targetTier,
          unlockedTechs: prev.unlockedTechs,
        });
        if (!rule.allowed) return prev;

        if (rule.isFree) {
          return {
            ...prev,
            buildings: prev.buildings.map((b) =>
              b.buildingId === 'main' ? { ...b, tier: targetTier } : b,
            ),
            logs: [`Main downgraded for free to Tier ${targetTier} (${rule.targetAge}).`, ...prev.logs].slice(0, 24),
          };
        }

        if (!hasEnoughResources(prev.inventory, rule.cost)) return prev;
        const busyBuilders = prev.tasks
          .filter(
            (t) =>
              t.kind === 'build' ||
              t.kind === 'upgrade' ||
              t.kind === 'upgrade_main' ||
              t.kind === 'upgrade_tier' ||
              t.kind === 'upgrade_wall',
          )
          .reduce((s, t) => s + (t.buildersUsed ?? 1), 0);
        if ((prev.units.builder ?? 0) - busyBuilders < rule.buildersRequired) return prev;

        const efficiencyMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
        const buildMs = Math.round((rule.buildTimeHours / efficiencyMult) * REAL_MS_PER_INGAME_HOUR);
        const completedAtMs = prev.virtualTimeMs + buildMs;

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, rule.cost),
          tasks: [
            ...prev.tasks,
            {
              id: `tier-${prev.nextSeq}`,
              kind: 'upgrade_main',
              buildingId: 'main',
              instanceId: main.instanceId,
              targetTier,
              buildersUsed: rule.buildersRequired,
              cost: { ...rule.cost },
              startedAtMs: prev.virtualTimeMs,
              arrivesAtMs: prev.virtualTimeMs,
              completedAtMs,
              returnsAtMs: completedAtMs,
              resolvedTier: false,
            },
          ],
          logs: [`Started Main Tier ${targetTier} (${rule.targetAge}) upgrade.`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const startCraftRecipe = useCallback(
    ({ buildingInstanceId, recipeId, quantity = 1 }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const building = prev.buildings.find((b) => b.instanceId === buildingInstanceId);
        const recipe = RECIPES[recipeId];
        if (!building || building.status !== 'active' || !recipe) return prev;
        if (!BUILDINGS[building.buildingId]?.craftsRecipes?.includes(recipeId)) return prev;
        if (recipe.requiredTech && !prev.unlockedTechs.includes(recipe.requiredTech)) return prev;
        const batchQty = Math.max(1, Math.floor(Number(quantity) || 1));
        const waterCost = (recipe.waterCostBowls ?? 0) * batchQty;
        if ((prev.water ?? 0) < waterCost) return prev;
        const scaledInputs = Object.fromEntries(
          Object.entries(recipe.inputs).map(([id, q]) => [id, q * batchQty]),
        );
        if (!hasEnoughResources(prev.inventory, scaledInputs)) return prev;
        const scaledOutputs = Object.fromEntries(
          Object.entries(recipe.outputs).map(([id, q]) => [id, q * batchQty]),
        );

        const efficiencyMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
        const completedAtMs =
          prev.virtualTimeMs +
          Math.round(
            ((recipe.craftTimeHours * batchQty) / efficiencyMult) * REAL_MS_PER_INGAME_HOUR,
          );

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, scaledInputs),
          water: prev.water - waterCost,
          tasks: [
            ...prev.tasks,
            {
              id: `craft-${prev.nextSeq}`,
              kind: 'craft',
              buildingInstanceId,
              recipeId,
              quantity: batchQty,
              cost: scaledInputs,
              waterSpent: waterCost,
              outputs: scaledOutputs,
              startedAtMs: prev.virtualTimeMs,
              completedAtMs,
              resolvedCraft: false,
            },
          ],
          logs: [
            `Started ${batchQty > 1 ? `${batchQty}x ` : ''}${recipe.name}.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const startResearchTech = useCallback(
    ({ buildingInstanceId, techId }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const building = prev.buildings.find((b) => b.instanceId === buildingInstanceId);
        const tech = TECHNOLOGIES[techId];
        if (!building || building.status !== 'active' || !tech) return prev;
        if (prev.unlockedTechs.includes(techId)) return prev;
        if (!BUILDINGS[building.buildingId]?.researchesTechs?.includes(techId)) return prev;
        if (!tech.prerequisites.every((p) => prev.unlockedTechs.includes(p))) return prev;
        if (!isTechTriggerSatisfied(techId, { builtBuildings: prev.buildings, craftedCounts: prev.craftedCounts })) {
          return prev;
        }
        if (!hasEnoughResources(prev.inventory, tech.cost)) return prev;

        const efficiencyMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
        const completedAtMs =
          prev.virtualTimeMs +
          Math.round((tech.researchTimeHours / efficiencyMult) * REAL_MS_PER_INGAME_HOUR);

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, tech.cost),
          tasks: [
            ...prev.tasks,
            {
              id: `tech-${prev.nextSeq}`,
              kind: 'research',
              buildingInstanceId,
              techId,
              cost: { ...tech.cost },
              startedAtMs: prev.virtualTimeMs,
              completedAtMs,
              resolvedResearch: false,
            },
          ],
          logs: [`Researching ${tech.name}...`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const startUpgradeBuildingTier = useCallback(
    (instanceId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const target = prev.buildings.find((b) => b.instanceId === instanceId);
        const hasPendingUpgrade = prev.tasks.some(
          (t) =>
            (t.kind === 'upgrade' || t.kind === 'upgrade_tier' || t.kind === 'upgrade_main') &&
            t.instanceId === instanceId,
        );
        if (hasPendingUpgrade) return prev;
        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const rule = getBuildingTierUpgradeRule({ building: target, mainTier: main?.tier ?? 1 });
        if (!rule.allowed || !hasEnoughResources(prev.inventory, rule.cost)) return prev;

        const busyBuilders = prev.tasks
          .filter(
            (t) =>
              t.kind === 'build' ||
              t.kind === 'upgrade' ||
              t.kind === 'upgrade_main' ||
              t.kind === 'upgrade_tier' ||
              t.kind === 'upgrade_wall',
          )
          .reduce((s, t) => s + (t.buildersUsed ?? 1), 0);
        if ((prev.units.builder ?? 0) - busyBuilders < rule.buildersRequired) return prev;

        const effMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
        const timing = calculateBuildTimestamps({
          from: { x: main.x, y: main.y },
          to: { x: target.x, y: target.y },
          buildingId: target.buildingId,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });
        const buildMs = Math.round((rule.buildTimeHours / effMult) * REAL_MS_PER_INGAME_HOUR);
        const completedAtMs = timing.arrivesAtMs + buildMs;

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spendResources(prev.inventory, rule.cost),
          tasks: [
            ...prev.tasks,
            {
              id: `tierbld-${prev.nextSeq}`,
              kind: 'upgrade_tier',
              buildingId: target.buildingId,
              instanceId,
              x: target.x,
              y: target.y,
              targetTier: rule.targetTier,
              buildersUsed: rule.buildersRequired,
              cost: { ...rule.cost },
              startedAtMs: prev.virtualTimeMs,
              arrivesAtMs: timing.arrivesAtMs,
              completedAtMs,
              returnsAtMs: completedAtMs + timing.oneWayTravelMs,
              resolvedTierReset: false,
            },
          ],
          logs: [
            `Upgrading ${BUILDINGS[target.buildingId].name} to Tier ${rule.targetTier} (resets Lv 1).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const startUpgradeWall = useCallback(() => {
    updateSessionState((prev) => {
      if (prev.isAbandoned || !prev.unlockedTechs.includes('stone_spear')) return prev;
      const main = prev.buildings.find((b) => b.buildingId === 'main');
      const wallDef = BUILDINGS.wall;
      const curWall = prev.wall ?? { tier: 2, level: 0, status: 'none' };
      if ((main?.tier ?? 1) < 2 || curWall.status === 'constructing') return prev;

      const isTierReset = curWall.level >= wallDef.maxLevel;
      const targetTier = isTierReset ? curWall.tier + 1 : curWall.tier;
      const targetLevel = isTierReset ? 1 : curWall.level + 1;
      if (targetTier > (main?.tier ?? 1) || targetTier > wallDef.maxTier) return prev;

      const cost = Object.fromEntries(
        Object.entries(wallDef.cost).map(([id, q]) => [id, q * targetTier * targetLevel]),
      );
      if (!hasEnoughResources(prev.inventory, cost)) return prev;

      const busyBuilders = prev.tasks
        .filter(
          (t) =>
            t.kind === 'build' ||
            t.kind === 'upgrade' ||
            t.kind === 'upgrade_main' ||
            t.kind === 'upgrade_tier' ||
            t.kind === 'upgrade_wall',
        )
        .reduce((s, t) => s + (t.buildersUsed ?? 1), 0);
      if ((prev.units.builder ?? 0) - busyBuilders < 1) return prev;

      const effMult = Math.max(0.2, 1 - (prev.efficiencyPenalty ?? 0));
      const completedAtMs =
        prev.virtualTimeMs +
        Math.round((wallDef.buildTimeHours / effMult) * REAL_MS_PER_INGAME_HOUR);

      return {
        ...prev,
        nextSeq: prev.nextSeq + 1,
        inventory: spendResources(prev.inventory, cost),
        wall: { ...curWall, status: 'constructing' },
        tasks: [
          ...prev.tasks,
          {
            id: `wall-${prev.nextSeq}`,
            kind: 'upgrade_wall',
            targetTier,
            targetLevel,
            buildersUsed: 1,
            cost,
            startedAtMs: prev.virtualTimeMs,
            arrivesAtMs: prev.virtualTimeMs,
            completedAtMs,
            returnsAtMs: completedAtMs,
            resolvedWall: false,
          },
        ],
        logs: [`Constructing City Wall Tier ${targetTier} Lv ${targetLevel}.`, ...prev.logs].slice(0, 24),
      };
    });
  }, [updateSessionState]);

  const prospectTile = useCallback(
    ({ x, y }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned || prev.territoryFog[y * prev.territorySize + x] !== 1) return prev;
        const tile = territory.tiles[y * prev.territorySize + x];
        if (!tile || tile.isWater) return prev;
        const busyPros = prev.tasks.filter((t) => t.kind === 'prospect').length;
        if ((prev.units.prospector ?? 0) - busyPros < 1) return prev;

        const main = prev.buildings.find((b) => b.buildingId === 'main');
        const timing = calculateUnitActionTimestamps({
          from: { x: main.x, y: main.y },
          to: { x, y },
          unitId: 'prospector',
          unlockedTechs: prev.unlockedTechs,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          tasks: [
            ...prev.tasks,
            {
              id: `pros-${prev.nextSeq}`,
              kind: 'prospect',
              unitId: 'prospector',
              x,
              y,
              startedAtMs: prev.virtualTimeMs,
              arrivesAtMs: timing.arrivesAtMs,
              completedAtMs: timing.workCompletedAtMs,
              returnsAtMs: timing.returnsAtMs,
              resolvedReturn: false,
            },
          ],
          logs: [`Dispatched Prospector to survey (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState, territory],
  );

  const dispatchContinentExpedition = useCallback(
    ({ toX, toY, units: reqUnits }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned || !continent) return prev;
        if (!prev.buildings.some((b) => b.buildingId === 'expedition_outpost' && b.status === 'active')) {
          return prev;
        }
        const plan = calculateContinentExpeditionPlan({
          from: spawnTile,
          to: { x: toX, y: toY },
          units: reqUnits,
          nowMs: prev.virtualTimeMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });
        if ((prev.water ?? 0) < plan.waterNeeded) return prev;

        const feed = consumeStoredFoodFEFO({
          inventory: prev.inventory,
          foodCarry: prev.foodCarry ?? 0,
          foodNeeded: plan.foodNeeded,
        });
        if (feed.isStarving) return prev;

        for (const [uId, qty] of Object.entries(reqUnits ?? {})) {
          if (qty <= 0) continue;
          let busy = 0;
          for (const t of prev.tasks) {
            if (t.kind === 'unit_action' || t.kind === 'expedition') busy += t.units?.[uId] ?? 0;
            if (t.kind === 'prospect' && uId === 'prospector') busy += 1;
          }
          if ((prev.units[uId] ?? 0) - busy < qty) return prev;
        }

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: feed.inventory,
          foodCarry: feed.foodCarry,
          water: prev.water - plan.waterNeeded,
          tasks: [
            ...prev.tasks,
            {
              id: `exp-${prev.nextSeq}`,
              kind: 'expedition',
              units: { ...reqUnits },
              toX,
              toY,
              waterSpent: plan.waterNeeded,
              foodSpent: plan.foodNeeded,
              startedAtMs: prev.virtualTimeMs,
              arrivesAtMs: plan.arrivesAtMs,
              completedAtMs: plan.completedAtMs,
              returnsAtMs: plan.returnsAtMs,
              resolvedReturn: false,
            },
          ],
          logs: [
            `Sent Continent expedition to (${toX}, ${toY}) with ${plan.foodNeeded} rations.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState, continent, spawnTile],
  );

  const depositSeedReserve = useCallback(
    ({ itemId, amount = 10 }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned || (itemId !== 'grain' && itemId !== 'roots')) return prev;
        const cap = calculateFarmSeedCapacity(prev.buildings);
        const curUsed = (prev.seedReserve?.grain ?? 0) + (prev.seedReserve?.roots ?? 0);
        const avail = prev.inventory[itemId] ?? 0;
        const moveQty = Math.min(avail, Math.max(0, cap - curUsed), Math.floor(amount));
        if (moveQty <= 0) return prev;

        const nextInv = spendResources(prev.inventory, { [itemId]: moveQty });
        if (nextInv[itemId] <= 0) delete nextInv[itemId];

        return {
          ...prev,
          inventory: nextInv,
          seedReserve: {
            ...(prev.seedReserve ?? {}),
            [itemId]: (prev.seedReserve?.[itemId] ?? 0) + moveQty,
          },
          logs: [`Stored ${moveQty} ${RESOURCES[itemId]?.name ?? itemId} in Farm Seed Vault.`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const plantCropPlotAction = useCallback(
    ({ x, y, cropId }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const crop = CROPS[cropId];
        if (!crop) return prev;
        const key = `${x},${y}`;
        const detail = prev.tileDetails?.[key] ?? {};
        const fromVault = prev.seedReserve?.[crop.seedItemId] ?? 0;
        const fromInv = prev.inventory[crop.seedItemId] ?? 0;
        const result = plantCropPlot({
          plot: detail.cropPlot,
          cropId,
          availableSeedQty: fromVault + fromInv,
        });
        if (result.planted <= 0) return prev;

        const takeVault = Math.min(fromVault, result.planted);
        const takeInv = result.planted - takeVault;
        const nextInv = takeInv > 0 ? spendResources(prev.inventory, { [crop.seedItemId]: takeInv }) : prev.inventory;
        if (takeInv > 0 && (nextInv[crop.seedItemId] ?? 0) <= 0) delete nextInv[crop.seedItemId];

        return {
          ...prev,
          inventory: nextInv,
          seedReserve: {
            ...(prev.seedReserve ?? {}),
            [crop.seedItemId]: fromVault - takeVault,
          },
          tileDetails: {
            ...(prev.tileDetails ?? {}),
            [key]: { ...detail, cropPlot: result.plot },
          },
          logs: [`Planted ${result.planted}/64 ${crop.name} at (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const harvestCropPlotAction = useCallback(
    ({ x, y }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const key = `${x},${y}`;
        const detail = prev.tileDetails?.[key] ?? {};
        const res = resolveCropHarvest({ plot: detail.cropPlot, unlockedTechs: prev.unlockedTechs });
        const harvestItems =
          res.items && Object.keys(res.items).length > 0
            ? res.items
            : res.itemId && res.harvestedQty > 0
              ? { [res.itemId]: res.harvestedQty }
              : {};
        if (Object.keys(harvestItems).length === 0) return prev;

        const maxStorage = calculateStorageCapacity(prev.buildings, prev.inventory).totalCapacity;
        const added = addItemsWithinCapacity(prev.inventory, harvestItems, maxStorage);
        const yieldSummary = Object.entries(harvestItems)
          .map(([id, q]) => `+${q} ${RESOURCES[id]?.name ?? id}`)
          .join(', ');

        return {
          ...prev,
          inventory: added.inventory,
          tileDetails: {
            ...(prev.tileDetails ?? {}),
            [key]: { ...detail, cropPlot: res.plot },
          },
          logs: [`Harvested ${yieldSummary} from (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const cancelTask = useCallback(
    (taskId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const task = prev.tasks.find((t) => t.id === taskId);
        if (!task || !canCancelTask(task, prev.virtualTimeMs).allowed) return prev;

        const nextBuildings =
          task.kind === 'build'
            ? prev.buildings.filter((b) => b.instanceId !== task.instanceId)
            : prev.buildings;

        const nextWall =
          task.kind === 'upgrade_wall'
            ? { ...(prev.wall ?? {}), status: (prev.wall?.level ?? 0) > 0 ? 'active' : 'none' }
            : prev.wall;

        const maxStorage = calculateStorageCapacity(nextBuildings, prev.inventory).totalCapacity;
        const refundedInv =
          task.cost && Object.keys(task.cost).length > 0
            ? addItemsWithinCapacity(prev.inventory, task.cost, maxStorage).inventory
            : prev.inventory;

        const nextAnimals = { ...(prev.animals ?? {}) };
        for (const [aId, qty] of Object.entries(task.animalsSpent ?? {})) {
          nextAnimals[aId] = (nextAnimals[aId] ?? 0) + qty;
        }

        const nextWaterCap = calculateWaterCapacity(nextBuildings, refundedInv);
        const nextWater =
          task.waterSpent > 0
            ? Math.min(nextWaterCap, (prev.water ?? 0) + task.waterSpent)
            : prev.water;

        const nextFoodCarry =
          task.foodSpent > 0 ? (prev.foodCarry ?? 0) + task.foodSpent : (prev.foodCarry ?? 0);

        return {
          ...prev,
          buildings: nextBuildings,
          wall: nextWall,
          inventory: refundedInv,
          animals: nextAnimals,
          water: nextWater,
          foodCarry: nextFoodCarry,
          tasks: prev.tasks.filter((t) => t.id !== taskId),
          logs: [`Cancelled ${task.kind.replace('_', ' ')} (resources refunded).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const fertilizeCropPlotAction = useCallback(
    ({ x, y, itemId = 'manure' }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned || !FERTILIZER_TO_NUTRIENT[itemId] || (prev.inventory[itemId] ?? 0) < 1) {
          return prev;
        }
        const key = `${x},${y}`;
        const detail = prev.tileDetails?.[key] ?? {};
        const nextInv = spendResources(prev.inventory, { [itemId]: 1 });
        if ((nextInv[itemId] ?? 0) <= 0) delete nextInv[itemId];

        return {
          ...prev,
          inventory: nextInv,
          tileDetails: {
            ...(prev.tileDetails ?? {}),
            [key]: { ...detail, cropPlot: fertilizeCropPlot(detail.cropPlot, itemId) },
          },
          logs: [
            `Fertilized Crop Field (${x}, ${y}) with ${RESOURCES[itemId]?.name ?? itemId} (+${FERTILIZER_TO_NUTRIENT[itemId]}).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const plantOrchardAction = useCallback(
    ({ x, y, treeId = 'apple_tree' }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const tree = ORCHARD_TREES[treeId] ?? ORCHARD_TREES.apple_tree;
        const key = `${x},${y}`;
        const detail = prev.tileDetails?.[key] ?? {};
        const avail = prev.inventory[tree.saplingItemId] ?? 0;
        const res = plantOrchardPlot({ plot: detail.orchardPlot, treeId, availableSaplings: avail });
        if (res.planted <= 0) return prev;

        const nextInv = spendResources(prev.inventory, { [tree.saplingItemId]: res.planted });
        if ((nextInv[tree.saplingItemId] ?? 0) <= 0) delete nextInv[tree.saplingItemId];

        return {
          ...prev,
          inventory: nextInv,
          tileDetails: {
            ...(prev.tileDetails ?? {}),
            [key]: { ...detail, orchardPlot: res.plot },
          },
          logs: [`Planted ${res.planted} ${tree.name} sapling(s) in Orchard (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const harvestOrchardAction = useCallback(
    ({ x, y }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const cal = getCalendarState(prev.virtualTimeMs);
        const key = `${x},${y}`;
        const detail = prev.tileDetails?.[key] ?? {};
        const res = resolveOrchardHarvest({
          plot: detail.orchardPlot,
          season: cal.season,
          year: cal.year,
          unlockedTechs: prev.unlockedTechs,
        });
        if (!res.itemId || res.harvestedQty <= 0) return prev;

        const maxStorage = calculateStorageCapacity(prev.buildings, prev.inventory).totalCapacity;
        const added = addItemsWithinCapacity(prev.inventory, { [res.itemId]: res.harvestedQty }, maxStorage);

        return {
          ...prev,
          inventory: added.inventory,
          tileDetails: {
            ...(prev.tileDetails ?? {}),
            [key]: { ...detail, orchardPlot: res.plot },
          },
          logs: [`Harvested +${res.harvestedQty} ${RESOURCES[res.itemId]?.name ?? res.itemId} from Orchard (${x}, ${y}).`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const tradeMarketResources = useCallback(
    ({ giveId, giveQty = 1, receiveId }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned || !giveId || !receiveId || giveId === receiveId) return prev;
        if (!prev.buildings.some((b) => b.buildingId === 'market' && b.status === 'active')) return prev;
        const qty = Math.floor(Number(giveQty));
        if (!Number.isFinite(qty) || qty <= 0 || (prev.inventory[giveId] ?? 0) < qty) return prev;
        if (!RESOURCES[receiveId] || RESOURCES[receiveId].category === 'livestock') return prev;

        const spent = spendResources(prev.inventory, { [giveId]: qty });
        if ((spent[giveId] ?? 0) <= 0) delete spent[giveId];
        const maxStorage = calculateStorageCapacity(prev.buildings, prev.inventory).totalCapacity;
        const added = addItemsWithinCapacity(spent, { [receiveId]: qty }, maxStorage);

        return {
          ...prev,
          inventory: added.inventory,
          logs: [`Market 1:1 trade: ${qty} ${RESOURCES[giveId]?.name ?? giveId} -> ${qty} ${RESOURCES[receiveId]?.name ?? receiveId}.`, ...prev.logs].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const repairBuilding = useCallback(
    (instanceId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const target = prev.buildings.find((b) => b.instanceId === instanceId);
        if (!target || target.status !== 'active') return prev;
        const cost = calculateBuildingRepairCost(target);
        if (Object.keys(cost).length === 0 || !hasEnoughResources(prev.inventory, cost)) {
          return prev;
        }
        return {
          ...prev,
          inventory: spendResources(prev.inventory, cost),
          buildings: prev.buildings.map((b) =>
            b.instanceId === instanceId
              ? { ...b, condition: 100, graceDaysRemaining: BUILDING_DEGRADATION_GRACE_DAYS }
              : b,
          ),
          logs: [
            `Repaired ${BUILDINGS[target.buildingId].name} to 100% condition.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const repairAllBuildings = useCallback(() => {
    updateSessionState((prev) => {
      if (prev.isAbandoned) return prev;
      const cost = calculateRepairAllCost(prev.buildings);
      if (Object.keys(cost).length === 0 || !hasEnoughResources(prev.inventory, cost)) {
        return prev;
      }
      return {
        ...prev,
        inventory: spendResources(prev.inventory, cost),
        buildings: prev.buildings.map((b) =>
          b.status === 'active'
            ? { ...b, condition: 100, graceDaysRemaining: BUILDING_DEGRADATION_GRACE_DAYS }
            : b,
        ),
        logs: ['Repaired all damaged village buildings to 100%.', ...prev.logs].slice(0, 24),
      };
    });
  }, [updateSessionState]);

  const demolishBuilding = useCallback(
    (instanceId) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const target = prev.buildings.find((b) => b.instanceId === instanceId);
        const check = canDemolishBuilding({
          building: target,
          buildings: prev.buildings,
          units: prev.units,
          starvationPopLoss: prev.starvationPopLoss ?? 0,
        });
        if (!check.allowed) return prev;

        const nextBuildings = prev.buildings.filter((b) => b.instanceId !== instanceId);
        const nextTasks = prev.tasks.filter(
          (t) => t.instanceId !== instanceId && t.buildingInstanceId !== instanceId,
        );
        const nextTileDetails = { ...(prev.tileDetails ?? {}) };
        delete nextTileDetails[`${target.x},${target.y}`];
        const nextWaterCap = calculateWaterCapacity(nextBuildings, prev.inventory);

        return {
          ...prev,
          buildings: nextBuildings,
          tasks: nextTasks,
          tileDetails: nextTileDetails,
          water: Math.min(prev.water ?? 0, nextWaterCap),
          logs: [
            `Destroyed ${BUILDINGS[target.buildingId].name} at (${target.x}, ${target.y}).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const slaughterAnimal = useCallback(
    ({ animalId, count = 1 }) => {
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        const res = slaughterLivestock({
        animals: prev.animals,
        animalId,
        count,
        unlockedTechs: prev.unlockedTechs,
      });
        if (res.slaughtered <= 0) return prev;
        const maxStorage = calculateStorageCapacity(prev.buildings, prev.inventory).totalCapacity;
        const added = addItemsWithinCapacity(prev.inventory, res.yields, maxStorage);
        const yieldSummary = Object.entries(res.yields)
          .map(([id, q]) => `+${q} ${RESOURCES[id]?.name ?? id}`)
          .join(', ');

        return {
          ...prev,
          animals: res.animals,
          inventory: added.inventory,
          logs: [
            `Butchered ${res.slaughtered} ${LIVESTOCK[animalId]?.name ?? animalId}: ${yieldSummary}.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  const unlockAllTerritoryFog = useCallback(() => {
    updateSessionState((prev) => {
      const total = prev.territorySize * prev.territorySize;
      const fullTerritoryFog = new Uint8Array(total).fill(1);
      const ring = unlockContinentRingIfTerritoryComplete({
        continentFog: new Uint8Array(prev.continentFog),
        continentSize: prev.continentSize,
        villageX: spawnTile.x,
        villageY: spawnTile.y,
        territoryExploredCount: total,
        territoryTotalTiles: total,
      });
      return {
        ...prev,
        territoryFog: Array.from(fullTerritoryFog),
        continentFog: Array.from(ring.fog),
        logs: ['Sandbox: Unlocked all Territory tiles.', ...(prev.logs ?? [])].slice(0, 24),
      };
    });
  }, [updateSessionState, spawnTile]);

  const unlockAllContinentFog = useCallback(() => {
    updateSessionState((prev) => {
      const total = prev.continentSize * prev.continentSize;
      return {
        ...prev,
        continentFog: Array.from(new Uint8Array(total).fill(1)),
        logs: ['Sandbox: Unlocked all Continent tiles.', ...(prev.logs ?? [])].slice(0, 24),
      };
    });
  }, [updateSessionState]);

  const createMarketOffer = useCallback(
    ({ offerId, offerQty, requestId, requestQty }) => {
      if (!marketStorageKey || !offerId || !requestId || offerId === requestId) return;
      const oQty = Math.floor(Number(offerQty));
      const rQty = Math.floor(Number(requestQty));
      if (!Number.isFinite(oQty) || oQty <= 0 || !Number.isFinite(rQty) || rQty <= 0) return;

      const unitBulk = RESOURCES[offerId]?.sizeClass ?? 2;
      const caravanCap = UNITS.caravan?.carryCapacity ?? 150;
      const caravansNeeded = Math.max(1, Math.ceil((oQty * unitBulk) / caravanCap));

      let createdOffer = null;
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        if (!prev.buildings.some((b) => b.buildingId === 'market' && b.status === 'active')) return prev;
        if ((prev.inventory[offerId] ?? 0) < oQty) return prev;
        const busy = calculateBusyUnits(prev.tasks, prev.marketEscrows);
        const freeCaravans = Math.max(0, (prev.units.caravan ?? 0) - (busy.caravan ?? 0));
        if (freeCaravans < caravansNeeded) return prev;

        const offerRecordId = `offer-${Date.now().toString(36)}-${prev.nextSeq}`;
        createdOffer = {
          id: offerRecordId,
          sellerCoords: { x: spawnTile.x, y: spawnTile.y },
          sellerStorageKey: storageKey,
          sellerVirtualTimeMs: prev.virtualTimeMs,
          offerId,
          offerQty: oQty,
          requestId,
          requestQty: rQty,
          caravansNeeded,
          status: 'open',
          buyerCoords: null,
          buyerStorageKey: null,
          buyerDelivered: false,
          sellerDelivered: false,
          startedAtMs: null,
          arrivesAtMs: null,
          returnsAtMs: null,
        };

        const spent = spendResources(prev.inventory, { [offerId]: oQty });
        if ((spent[offerId] ?? 0) <= 0) delete spent[offerId];

        return {
          ...prev,
          nextSeq: prev.nextSeq + 1,
          inventory: spent,
          marketEscrows: {
            ...(prev.marketEscrows ?? {}),
            [offerRecordId]: { caravansNeeded },
          },
          logs: [
            `Posted trade offer: ${oQty} ${RESOURCES[offerId]?.name ?? offerId} for ${rQty} ${RESOURCES[requestId]?.name ?? requestId} (${caravansNeeded} Caravan escrowed).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });

      if (createdOffer) {
        const nextOffers = [createdOffer, ...loadMarketOffers(marketStorageKey)];
        saveMarketOffers(marketStorageKey, nextOffers);
        setMarketOffers(nextOffers);
      }
    },
    [marketStorageKey, spawnTile, storageKey, updateSessionState],
  );

  const acceptMarketOffer = useCallback(
    (offerRecordId) => {
      if (!marketStorageKey) return;
      const existing = loadMarketOffers(marketStorageKey);
      const target = existing.find((o) => o.id === offerRecordId && o.status === 'open');
      if (!target || target.sellerStorageKey === storageKey) return;

      let acceptedPlan = null;
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        if (!prev.buildings.some((b) => b.buildingId === 'market' && b.status === 'active')) return prev;
        if ((prev.inventory[target.requestId] ?? 0) < target.requestQty) return prev;

        const baseClockMs = Math.max(prev.virtualTimeMs, target.sellerVirtualTimeMs ?? 0);
        const plan = calculateMarketTradePlan({
          from: target.sellerCoords,
          to: spawnTile,
          offerId: target.offerId,
          offerQty: target.offerQty,
          nowMs: baseClockMs,
          efficiencyPenalty: prev.efficiencyPenalty ?? 0,
        });
        acceptedPlan = { ...plan, baseClockMs };

        const spent = spendResources(prev.inventory, { [target.requestId]: target.requestQty });
        if ((spent[target.requestId] ?? 0) <= 0) delete spent[target.requestId];

        return {
          ...prev,
          virtualTimeMs: Math.max(prev.virtualTimeMs, baseClockMs),
          inventory: spent,
          logs: [
            `Accepted trade from (${target.sellerCoords.x}, ${target.sellerCoords.y}): locked ${target.requestQty} ${RESOURCES[target.requestId]?.name ?? target.requestId}, Caravan en route.`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });

      if (acceptedPlan) {
        const nextOffers = existing.map((o) =>
          o.id === offerRecordId
            ? {
                ...o,
                status: 'in_transit',
                buyerCoords: { x: spawnTile.x, y: spawnTile.y },
                buyerStorageKey: storageKey,
                startedAtMs: acceptedPlan.baseClockMs,
                arrivesAtMs: acceptedPlan.arrivesAtMs,
                returnsAtMs: acceptedPlan.returnsAtMs,
              }
            : o,
        );
        saveMarketOffers(marketStorageKey, nextOffers);
        setMarketOffers(nextOffers);
      }
    },
    [marketStorageKey, spawnTile, storageKey, updateSessionState],
  );

  const cancelMarketOffer = useCallback(
    (offerRecordId) => {
      if (!marketStorageKey) return;
      const existing = loadMarketOffers(marketStorageKey);
      const target = existing.find(
        (o) => o.id === offerRecordId && o.status === 'open' && o.sellerStorageKey === storageKey,
      );
      if (!target) return;

      updateSessionState((prev) => {
        const nextEscrows = { ...(prev.marketEscrows ?? {}) };
        delete nextEscrows[offerRecordId];
        const maxCap = calculateStorageCapacity(prev.buildings, prev.inventory).totalCapacity;
        const refunded = addItemsWithinCapacity(
          prev.inventory,
          { [target.offerId]: target.offerQty },
          maxCap,
        );
        return {
          ...prev,
          inventory: refunded.inventory,
          marketEscrows: nextEscrows,
          logs: [
            `Cancelled trade offer (${target.offerQty} ${RESOURCES[target.offerId]?.name ?? target.offerId} returned).`,
            ...prev.logs,
          ].slice(0, 24),
        };
      });

      const remaining = existing.filter((o) => o.id !== offerRecordId);
      saveMarketOffers(marketStorageKey, remaining);
      setMarketOffers(remaining);
    },
    [marketStorageKey, storageKey, updateSessionState],
  );

  const jumpSimulationDays = useCallback(
    (days = 1) => {
      const cleanDays = Math.max(1, Math.floor(Number(days) || 0));
      let jumpedClockMs = 0;
      updateSessionState((prev) => {
        if (prev.isAbandoned) return prev;
        jumpedClockMs = prev.virtualTimeMs + cleanDays * REAL_MS_PER_INGAME_DAY;
        const next = advanceVillageSimulation(
          prev,
          jumpedClockMs,
          territory,
          spawnTile,
          continent,
        );
        return {
          ...next,
          logs: [
            `Sandbox: Jumped +${cleanDays} day${cleanDays === 1 ? '' : 's'}.`,
            ...(next.logs ?? []),
          ].slice(0, 24),
        };
      });
      if (marketStorageKey && jumpedClockMs > 0) {
        syncMarketDeliveries(jumpedClockMs, storageKey);
      }
    },
    [updateSessionState, territory, spawnTile, continent, marketStorageKey, storageKey, syncMarketDeliveries],
  );

  const grantSandboxResource = useCallback(
    ({ resourceId, amount = 10 }) => {
      const qty = Math.max(1, Math.floor(Number(amount) || 0));
      updateSessionState((prev) => {
        if (resourceId === 'water') {
          return {
            ...prev,
            water: (prev.water ?? 0) + qty,
            logs: [`Sandbox: Added +${qty} Water Bowls.`, ...(prev.logs ?? [])].slice(0, 24),
          };
        }
        const def = RESOURCES[resourceId];
        if (!def) return prev;
        if (def.category === 'livestock') {
          return {
            ...prev,
            animals: {
              ...(prev.animals ?? {}),
              [resourceId]: (prev.animals?.[resourceId] ?? 0) + qty,
            },
            logs: [`Sandbox: Added +${qty} ${def.name}.`, ...(prev.logs ?? [])].slice(0, 24),
          };
        }
        return {
          ...prev,
          inventory: {
            ...prev.inventory,
            [resourceId]: (prev.inventory[resourceId] ?? 0) + qty,
          },
          logs: [`Sandbox: Added +${qty} ${def.name}.`, ...(prev.logs ?? [])].slice(0, 24),
        };
      });
    },
    [updateSessionState],
  );

  return {
    state,
    calendar,
    territoryFogMask,
    continentFogMask,
    mainBuilding,
    storageUsed,
    storageCapacity,
    preservedFoodCapacity,
    farmSeedCapacity,
    farmAttachmentsUsed,
    farmMaxAttachments,
    animalPenCapacity,
    wallBonuses,
    storedFood,
    waterCapacity,
    effectiveSpeedFactor,
    buildingMaxPop,
    maxPop,
    popUsed,
    starvationStage,
    busyUnits,
    freeUnits,
    marketOffers,
    setSpeedFactor,
    resetVillage,
    trainUnit,
    refitUnitTier,
    dismissUnit,
    cancelTask,
    removeResource,
    dispatchTileAction,
    prospectTile,
    dispatchContinentExpedition,
    evaluateBuildingOptions,
    startBuildBuilding,
    startUpgradeBuilding,
    startUpgradeBuildingTier,
    startUpgradeWall,
    changeMainTier,
    startCraftRecipe,
    startResearchTech,
    depositSeedReserve,
    plantCropPlotAction,
    harvestCropPlotAction,
    fertilizeCropPlotAction,
    plantOrchardAction,
    harvestOrchardAction,
    tradeMarketResources,
    createMarketOffer,
    acceptMarketOffer,
    cancelMarketOffer,
    repairBuilding,
    repairAllBuildings,
    demolishBuilding,
    slaughterAnimal,
    unlockAllTerritoryFog,
    unlockAllContinentFog,
    jumpSimulationDays,
    grantSandboxResource,
  };
}
