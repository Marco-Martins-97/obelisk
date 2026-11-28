/**
 * Pure deterministic Stage 4 (Copper Age) game math:
 * - Building Tier upgrades (Lv max -> Next Tier Lv 1) & spatial placement validation
 * - Ore Prospector reports & sparse tile deposit depletion
 * - Tribal-Wars-style continuous production (Mine, Timber Camp, Quarry, Clay Pit, Well)
 * - Farming Seed Vaults, Crop Fields (8x8), A/B/C Soil Nutrients, Orchards (9 trees) & Livestock
 * - Wall fortification mitigation & Continent Map expedition planning/resolution
 *
 * Isomorphic & environment-agnostic: never uses Math.random() or Node/DOM APIs.
 */

import { BUILDINGS } from '../config/buildings.js';
import {
  CROPS,
  LIVESTOCK,
  ORCHARD_TREES,
  classifyOreDensitySample,
} from '../config/farming.js';
import { RESOURCES } from '../config/resources.js';
import { RECIPES } from '../config/recipes.js';
import { TECHNOLOGIES } from '../config/technologies.js';
import { UNITS } from '../config/units.js';
import {
  CONTINENT_TILE_DISTANCE_KM,
  HOURS_PER_INGAME_DAY,
  REAL_MS_PER_INGAME_DAY,
  REAL_MS_PER_INGAME_HOUR,
} from '../config/worldConstants.js';
import { ORES } from '../config/worldGeology.js';
import { TERRITORY_FOREST_THRESHOLD } from '../generators/territoryGenerator.js';
import {
  calculateMaxPopulation,
  calculatePopUsed,
  calculateStorageCapacity,
  calculateStorageUsed,
  calculateTierLevelValue,
  getBestUnlockedTool,
  revealBox3x3,
} from './stoneAgeMath.js';

/** Canonical ore resource ID produced by Mines for each geological ore layer. */
export function resolveMinedOreResourceId(oreId) {
  const oreVariant = `${oreId}_ore`;
  if (RESOURCES[oreVariant]) return oreVariant;
  if (RESOURCES[oreId]) return oreId;
  return oreId;
}

/**
 * Computes material cost and validation for advancing an active building from
 * `level === maxLevel` in `tier` to `level = 1` in `tier + 1`.
 *
 * @param {object} params
 * @param {{ buildingId: string, tier?: number, level?: number, status?: string }} params.building
 * @param {number} params.mainTier - Current Main Hall Age tier.
 * @returns {{
 *   allowed: boolean,
 *   targetTier: number,
 *   cost: Record<string, number>,
 *   buildTimeHours: number,
 *   buildersRequired: number,
 *   reason: string | null,
 * }} Tier upgrade rule & cost summary.
 */
export function getBuildingTierUpgradeRule({ building, mainTier = 1 }) {
  const def = building ? BUILDINGS[building.buildingId] : null;
  if (!building || !def) {
    return { allowed: false, targetTier: 1, cost: {}, buildTimeHours: 0, buildersRequired: 0, reason: 'Invalid building.' };
  }

  const currentTier = building.tier ?? def.tier;
  const targetTier = currentTier + 1;
  if (building.status && building.status !== 'active') {
    return { allowed: false, targetTier, cost: {}, buildTimeHours: 0, buildersRequired: 0, reason: 'Finish current work first.' };
  }
  if ((building.level ?? 1) < def.maxLevel) {
    return { allowed: false, targetTier, cost: {}, buildTimeHours: 0, buildersRequired: 0, reason: `Reach Level ${def.maxLevel} first.` };
  }
  if (currentTier >= def.maxTier) {
    return { allowed: false, targetTier, cost: {}, buildTimeHours: 0, buildersRequired: 0, reason: 'Building is already at max Tier.' };
  }
  if (mainTier < targetTier) {
    return { allowed: false, targetTier, cost: {}, buildTimeHours: 0, buildersRequired: 0, reason: `Requires Main Tier ${targetTier}.` };
  }

  const cost = Object.fromEntries(
    Object.entries(def.cost ?? {}).map(([id, q]) => [id, Math.max(1, Math.round(q * targetTier))]),
  );

  return {
    allowed: true,
    targetTier,
    cost,
    buildTimeHours: def.buildTimeHours * targetTier,
    buildersRequired: Math.max(1, def.buildersRequired),
    reason: null,
  };
}

/**
 * Computes dedicated seed vault storage capacity from active Farmsteads.
 *
 * @param {Array<{ buildingId: string, tier?: number, level?: number, status?: string }>} buildings
 * @returns {number} Total farm seed storage capacity.
 */
export function calculateFarmSeedCapacity(buildings) {
  let total = 0;
  for (const instance of buildings ?? []) {
    if (instance.status && instance.status !== 'active') continue;
    if (instance.buildingId !== 'farm') continue;
    const def = BUILDINGS.farm;
    total += calculateTierLevelValue(
      def.storageTierBases,
      instance.tier ?? def.tier,
      instance.level ?? 1,
      def.maxLevel,
    );
  }
  return total;
}

/**
 * Computes maximum allowed Farm attachments (`crop_field`, `animal_pen`, `orchard`) across active Farmsteads.
 *
 * @param {Array<{ buildingId: string, tier?: number, level?: number, status?: string }>} buildings
 * @returns {number} Total attachment slots allowed.
 */
export function calculateFarmMaxAttachments(buildings) {
  let total = 0;
  for (const instance of buildings ?? []) {
    if (instance.status && instance.status !== 'active') continue;
    if (instance.buildingId !== 'farm') continue;
    const def = BUILDINGS.farm;
    total += calculateTierLevelValue(
      def.attachmentTierBases,
      instance.tier ?? def.tier,
      instance.level ?? 1,
      def.maxLevel,
    );
  }
  return total;
}

/**
 * Computes total livestock housing capacity across active Animal Pens.
 *
 * @param {Array<{ buildingId: string, tier?: number, level?: number, status?: string }>} buildings
 * @returns {number} Total animal capacity across all active Animal Pens.
 */
export function calculateAnimalPenCapacity(buildings) {
  let total = 0;
  for (const instance of buildings ?? []) {
    if (instance.status && instance.status !== 'active') continue;
    if (instance.buildingId !== 'animal_pen') continue;
    const def = BUILDINGS.animal_pen;
    total += calculateTierLevelValue(
      def.penCapacityTierBases,
      instance.tier ?? def.tier,
      instance.level ?? 1,
      def.maxLevel,
    );
  }
  return total;
}

/**
 * Computes active City Wall defense % and building degradation reduction fraction.
 *
 * @param {{ tier?: number, level?: number, status?: string } | null} wallState
 * @returns {{ defensePercent: number, degradationReduction: number }}
 */
export function getWallBonuses(wallState) {
  if (!wallState || (wallState.level ?? 0) <= 0) {
    return { defensePercent: 0, degradationReduction: 0 };
  }
  const def = BUILDINGS.wall;
  const defensePercent = calculateTierLevelValue(
    def.defenseTierBases,
    wallState.tier ?? def.tier,
    wallState.level,
    def.maxLevel,
  );
  return {
    defensePercent,
    degradationReduction: Math.min(0.8, defensePercent / 100),
  };
}

/**
 * Evaluates the strongest active `Watchtower` (`3x3` aura) covering tile `(x, y)`.
 *
 * @param {Array<{ buildingId: string, x: number, y: number, tier?: number, level?: number, status?: string }>} buildings
 * @param {number} x
 * @param {number} y
 * @returns {number} Highest Watchtower defense percentage covering `(x, y)` (0 if uncovered).
 */
export function getWatchtowerTileDefense(buildings = [], x = 0, y = 0) {
  const towerDef = BUILDINGS.watchtower;
  if (!towerDef) return 0;

  let best = 0;
  for (const bld of buildings ?? []) {
    if (bld.buildingId !== 'watchtower') continue;
    if (bld.status && bld.status !== 'active') continue;
    if (Math.abs(bld.x - x) <= 1 && Math.abs(bld.y - y) <= 1) {
      const pct = calculateTierLevelValue(
        towerDef.defenseTierBases,
        bld.tier ?? towerDef.tier,
        bld.level ?? 1,
        towerDef.maxLevel,
      );
      if (pct > best) best = pct;
    }
  }
  return best;
}

/** Active city footprint side length (in tiles) keyed by Main Village Hall tier (`1..5`). */
export const CITY_SIZE_BY_MAIN_TIER = Object.freeze({
  1: 0,
  2: 1,
  3: 3,
  4: 5,
  5: 7,
});

/**
 * Computes the inclusive square city footprint bounds centered on `Main Village Hall`
 * for the active village Age tier (`Stone: 0`, `Copper: 1×1`, `Bronze: 3×3`, `Iron: 5×5`, `Steel: 7×7`).
 *
 * @param {object} [params={}]
 * @param {Array<object>} [params.buildings=[]]
 * @param {number | null} [params.mainTier=null]
 * @param {number} [params.centerX=12]
 * @param {number} [params.centerY=12]
 * @returns {{
 *   size: number,
 *   halfRadius: number,
 *   centerX: number,
 *   centerY: number,
 *   minX: number,
 *   maxX: number,
 *   minY: number,
 *   maxY: number,
 * }} Inclusive tile bounds (when `size === 0`, `maxX < minX`).
 */
export function getCityZoneBounds({
  buildings = [],
  mainTier = null,
  centerX = 12,
  centerY = 12,
} = {}) {
  const main = (buildings ?? []).find((b) => b.buildingId === 'main');
  const tier = Math.min(5, Math.max(1, Number(mainTier ?? main?.tier ?? 1) || 1));
  const cx = main?.x ?? centerX;
  const cy = main?.y ?? centerY;
  const size = CITY_SIZE_BY_MAIN_TIER[tier] ?? 0;

  if (size <= 0) {
    return {
      size: 0,
      halfRadius: -1,
      centerX: cx,
      centerY: cy,
      minX: cx,
      maxX: cx - 1,
      minY: cy,
      maxY: cy - 1,
    };
  }

  const halfRadius = (size - 1) / 2;
  return {
    size,
    halfRadius,
    centerX: cx,
    centerY: cy,
    minX: cx - halfRadius,
    maxX: cx + halfRadius,
    minY: cy - halfRadius,
    maxY: cy + halfRadius,
  };
}

/**
 * Checks whether tile `(x, y)` lies inside the active village city footprint.
 *
 * @param {object} [params={}]
 * @param {number} [params.x=0]
 * @param {number} [params.y=0]
 * @param {Array<object>} [params.buildings=[]]
 * @param {number | null} [params.mainTier=null]
 * @param {number} [params.centerX=12]
 * @param {number} [params.centerY=12]
 * @returns {boolean}
 */
export function isTileInCityZone({
  x = 0,
  y = 0,
  buildings = [],
  mainTier = null,
  centerX = 12,
  centerY = 12,
} = {}) {
  const bounds = getCityZoneBounds({ buildings, mainTier, centerX, centerY });
  return (
    bounds.size > 0 &&
    x >= bounds.minX &&
    x <= bounds.maxX &&
    y >= bounds.minY &&
    y <= bounds.maxY
  );
}

/**
 * Computes effective fortification & degradation reduction at `(x, y)`.
 * `City Wall` applies only inside the active City footprint while covering `Watchtower`
 * (`3x3` zone) applies around the tower — the single highest active protection value prevails.
 *
 * @param {object} params
 * @param {Array<object>} [params.buildings=[]]
 * @param {{ tier?: number, level?: number } | null} [params.wall=null]
 * @param {number} [params.x=0]
 * @param {number} [params.y=0]
 * @returns {{ defensePercent: number, degradationReduction: number, wallDefense: number, towerDefense: number }}
 */
export function getEffectiveTileProtection({ buildings = [], wall = null, x = 0, y = 0 } = {}) {
  const main = (buildings ?? []).find((b) => b.buildingId === 'main');
  const effectiveMainTier = main?.tier ?? wall?.tier ?? 1;
  const inCity = isTileInCityZone({ x, y, buildings, mainTier: effectiveMainTier });
  const wallDefense = inCity ? getWallBonuses(wall).defensePercent : 0;
  const towerDefense = getWatchtowerTileDefense(buildings, x, y);
  const defensePercent = Math.max(wallDefense, towerDefense);
  return {
    defensePercent,
    degradationReduction: Math.min(0.8, defensePercent / 100),
    wallDefense,
    towerDefense,
  };
}

/**
 * Validates tile placement rules for Copper Age buildings (`timber_camp` forest-only,
 * `clay_pit` near water, `crop_field`/`animal_pen`/`orchard` adjacent to active Farmstead).
 *
 * @param {object} params
 * @param {string} params.buildingId
 * @param {number} params.x
 * @param {number} params.y
 * @param {object} params.territory
 * @param {Array<{ buildingId: string, x: number, y: number, status?: string, tier?: number, level?: number }>} params.buildings
 * @returns {{ allowed: boolean, reason: string | null }} Placement validation verdict.
 */
export function validateBuildingPlacement({ buildingId, x, y, territory, buildings = [] }) {
  const def = BUILDINGS[buildingId];
  if (!def) return { allowed: false, reason: 'Unknown building.' };

  const size = territory?.size ?? 25;
  const tile = territory?.tiles?.[y * size + x];
  if (!tile || tile.isWater || !tile.buildable) {
    return { allowed: false, reason: 'Terrain is unbuildable.' };
  }

  if (def.placementRule === 'forest_only') {
    if ((tile.forestDensity ?? 0) < TERRITORY_FOREST_THRESHOLD) {
      return { allowed: false, reason: 'Must be built on a Forest tile.' };
    }
    return { allowed: true, reason: null };
  }

  if (def.placementRule === 'near_water') {
    let nearWater = false;
    for (let dy = -1; dy <= 1 && !nearWater; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (territory.tiles[ny * size + nx]?.isWater) {
          nearWater = true;
          break;
        }
      }
    }
    return nearWater
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'Must be placed next to a Water tile.' };
  }

  if (def.placementRule === 'adjacent_to_farm') {
    const activeFarms = buildings.filter(
      (b) => b.buildingId === 'farm' && (!b.status || b.status === 'active'),
    );
    if (activeFarms.length === 0) {
      return { allowed: false, reason: 'Build a Farmstead first.' };
    }

    const nearFarm = activeFarms.some(
      (farm) => Math.max(Math.abs(farm.x - x), Math.abs(farm.y - y)) === 1,
    );
    if (!nearFarm) {
      return { allowed: false, reason: 'Must be adjacent to an active Farmstead.' };
    }

    const attachmentCount = buildings.filter(
      (b) => b.buildingId === 'crop_field' || b.buildingId === 'animal_pen' || b.buildingId === 'orchard',
    ).length;
    const maxAttachments = calculateFarmMaxAttachments(buildings);
    if (attachmentCount >= maxAttachments) {
      return {
        allowed: false,
        reason: `Farmstead attachment limit reached (${attachmentCount}/${maxAttachments}). Upgrade Farmstead.`,
      };
    }
    return { allowed: true, reason: null };
  }

  return { allowed: true, reason: null };
}

/**
 * Analyzes a Territory tile's mineral layers and builds a Prospector survey report.
 *
 * @param {object} tile - Territory sub-tile with `ores` dictionary.
 * @param {string} [rockType='rock'] - Territory stone layer name.
 * @returns {{
 *   rockType: string,
 *   forestDensity: number,
 *   ores: Array<{ oreId: string, name: string, density: number, sampleLabel: string, estimatedDeposit: number }>,
 * }} Prospection survey report.
 */
export function buildProspectionReport(tile, rockType = 'rock') {
  const oreEntries = Object.entries(tile?.ores ?? {}).map(([oreId, density]) => {
    const cleanDensity = Math.max(0, Math.min(1, Number(density) || 0));
    const sampleLabel = classifyOreDensitySample(cleanDensity);
    const estimatedDeposit =
      cleanDensity >= 0.05 ? Math.round(BUILDINGS.mine.baseDepositAmount * cleanDensity) : 0;

    return {
      oreId,
      name: ORES[oreId]?.name ?? oreId,
      density: cleanDensity,
      sampleLabel,
      estimatedDeposit,
    };
  });

  return {
    rockType,
    forestDensity: Math.max(0, Math.min(1, Number(tile?.forestDensity) || 0)),
    ores: oreEntries,
  };
}

/**
 * Initializes sparse deposit counters for `tileDetails["x,y"]` when constructing
 * extraction buildings (`mine`, `timber_camp`, `quarry`, `clay_pit`).
 *
 * @param {string} buildingId
 * @param {object} tile - Target Territory tile.
 * @param {object} [existingDetail={}] - Existing sparse tile details object.
 * @returns {object} Updated sparse tile detail copy.
 */
export function initializeTileDeposit(buildingId, tile, existingDetail = {}) {
  const def = BUILDINGS[buildingId];
  const next = { ...existingDetail };
  if (!def?.depositKey) return next;

  if (def.depositKey === 'ore' && !next.oreLeft) {
    const oreLeft = {};
    for (const [oreId, rawDensity] of Object.entries(tile?.ores ?? {})) {
      const density = Math.max(0, Math.min(1, Number(rawDensity) || 0));
      if (density >= 0.05) {
        oreLeft[oreId] = Math.round((def.baseDepositAmount ?? 100000) * density);
      }
    }
    next.oreLeft = oreLeft;
  } else if (def.depositKey === 'forest' && next.forestLeft === undefined) {
    next.forestLeft = Math.round((def.baseDepositAmount ?? 25000) * Math.max(0, tile?.forestDensity ?? 0));
  } else if (def.depositKey === 'clay' && next.clayLeft === undefined) {
    next.clayLeft = def.baseDepositAmount ?? 10000;
  } else if (def.depositKey === 'stone' && next.stoneLeft === undefined) {
    next.stoneLeft = def.baseDepositAmount ?? 50000;
  }

  return next;
}

/**
 * Resolves tool specialization bonus (`axe`, `pickaxe`, `shovel`) for a production building.
 *
 * @param {string} buildingId
 * @param {string[] | Set<string>} unlockedTechs
 * @returns {number} Work speed multiplier (>= 1).
 */
function getProductionToolMultiplier(buildingId, unlockedTechs) {
  const toolType =
    buildingId === 'timber_camp'
      ? 'axe'
      : buildingId === 'mine' || buildingId === 'quarry'
        ? 'pickaxe'
        : buildingId === 'clay_pit' || buildingId === 'well'
          ? 'shovel'
          : null;
  if (!toolType) return 1.0;
  return getBestUnlockedTool(unlockedTechs, toolType)?.modifiers?.workSpeedMultiplier ?? 1.0;
}

/**
 * Calculates live per-in-game-day production breakdown for a single active extraction building.
 *
 * @param {object} params
 * @param {object} params.building
 * @param {object} params.tile
 * @param {object} [params.tileDetail={}]
 * @param {object | null} [params.territory=null]
 * @param {string[]} [params.unlockedTechs=[]]
 * @param {number} [params.efficiencyPenalty=0]
 * @returns {Array<{ resourceId: string, ratePerDay: number, remaining: number | null, oreId?: string }>}
 */
export function getBuildingDailyProduction({
  building,
  tile,
  tileDetail = {},
  territory = null,
  unlockedTechs = [],
  efficiencyPenalty = 0,
}) {
  const def = building ? BUILDINGS[building.buildingId] : null;
  if (!def?.productionTierBases || (building.status && building.status !== 'active')) return [];

  const conditionMult = Math.max(0, Math.min(1, (building.condition ?? 100) / 100));
  if (conditionMult <= 0) return [];

  const tier = building.tier ?? def.tier;
  const level = Math.max(1, Math.min(building.level ?? 1, def.maxLevel));
  const basePerDay = calculateTierLevelValue(def.productionTierBases, tier, level, def.maxLevel);
  const toolMult = getProductionToolMultiplier(def.id, unlockedTechs);
  const effMult = Math.max(0.2, 1 - efficiencyPenalty);
  const effectiveDaily = basePerDay * toolMult * effMult * conditionMult;

  if (def.id === 'mine') {
    const oreLeftMap = tileDetail.oreLeft ?? initializeTileDeposit('mine', tile).oreLeft ?? {};
    return Object.entries(tile?.ores ?? {})
      .filter(([oreId, d]) => d >= 0.05 && (oreLeftMap[oreId] ?? 0) > 0)
      .map(([oreId, density]) => ({
        oreId,
        resourceId: resolveMinedOreResourceId(oreId),
        ratePerDay: Math.round(effectiveDaily * density * 100) / 100,
        remaining: oreLeftMap[oreId] ?? 0,
      }));
  }

  if (def.id === 'timber_camp') {
    const density = Math.max(0, Math.min(1, tile?.forestDensity ?? 0));
    const remaining = tileDetail.forestLeft ?? initializeTileDeposit('timber_camp', tile).forestLeft ?? 0;
    return remaining > 0 && density > 0
      ? [{ resourceId: 'wood_logs', ratePerDay: Math.round(effectiveDaily * density * 100) / 100, remaining }]
      : [];
  }

  if (def.id === 'clay_pit') {
    const remaining = tileDetail.clayLeft ?? def.baseDepositAmount ?? 10000;
    return remaining > 0
      ? [{ resourceId: 'clay', ratePerDay: Math.round(effectiveDaily * 100) / 100, remaining }]
      : [];
  }

  if (def.id === 'quarry') {
    const remaining = tileDetail.stoneLeft ?? def.baseDepositAmount ?? 50000;
    return remaining > 0
      ? [{ resourceId: 'stone_blocks', ratePerDay: Math.round(effectiveDaily * 100) / 100, remaining }]
      : [];
  }

  if (def.id === 'well') {
    const tileMoist = Math.max(0, Math.min(1, Number(tile?.moisture ?? 0.5)));
    const terrMoist = territory?.tiles?.length
      ? territory.tiles.reduce((s, t) => s + (t.moisture ?? 0.5), 0) / territory.tiles.length
      : tileMoist;
    const moistureMult = 0.5 + 0.7 * terrMoist + 0.3 * tileMoist;
    return [
      {
        resourceId: 'water',
        ratePerDay: Math.round(effectiveDaily * moistureMult * 100) / 100,
        remaining: null,
      },
    ];
  }

  if (def.id === 'port') {
    return [
      {
        resourceId: 'fish',
        ratePerDay: Math.round(effectiveDaily * 100) / 100,
        remaining: null,
      },
    ];
  }

  return [];
}

/**
 * Advances continuous Tribal-Wars-style production across all active extraction buildings
 * using `deltaVirtualMs` and fractional carryovers. Stops automatically when village storage
 * or water capacity is full or when a tile deposit hits `0`.
 *
 * @param {object} params
 * @returns {{
 *   inventory: Record<string, number>,
 *   water: number,
 *   tileDetails: Record<string, object>,
 *   productionCarry: Record<string, number>,
 * }} Updated resources, tile deposits, and fractional carry map.
 */
export function advanceContinuousProduction({
  buildings = [],
  territory,
  tileDetails = {},
  inventory = {},
  water = 0,
  waterCapacity = 10,
  productionCarry = {},
  unlockedTechs = [],
  efficiencyPenalty = 0,
  deltaVirtualMs = 0,
}) {
  if (deltaVirtualMs <= 0) {
    return { inventory, water, tileDetails, productionCarry };
  }

  const deltaDays = deltaVirtualMs / REAL_MS_PER_INGAME_DAY;
  const nextInventory = { ...inventory };
  let nextWater = water;
  const nextTileDetails = { ...tileDetails };
  const nextCarry = { ...productionCarry };

  const maxStorage = calculateStorageCapacity(buildings, nextInventory).totalCapacity;
  let usedStorage = calculateStorageUsed(nextInventory);
  const size = territory?.size ?? 25;

  for (const bld of buildings) {
    if (bld.status && bld.status !== 'active') continue;
    const def = BUILDINGS[bld.buildingId];
    if (!def?.productionTierBases) continue;

    const coordKey = `${bld.x},${bld.y}`;
    const tile = territory?.tiles?.[bld.y * size + bld.x];
    const detail = initializeTileDeposit(bld.buildingId, tile, nextTileDetails[coordKey] ?? {});
    nextTileDetails[coordKey] = detail;

    const streams = getBuildingDailyProduction({
      building: bld,
      tile,
      tileDetail: detail,
      territory,
      unlockedTechs,
      efficiencyPenalty,
    });

    for (const stream of streams) {
      const carryKey = `${bld.instanceId}:${stream.resourceId}`;
      if (stream.resourceId === 'water') {
        if (nextWater >= waterCapacity) continue;
        const acc = (nextCarry[carryKey] ?? 0) + stream.ratePerDay * deltaDays;
        const whole = Math.min(waterCapacity - nextWater, Math.floor(acc + 1e-9));
        nextWater += whole;
        nextCarry[carryKey] = Math.round((acc - whole) * 10000) / 10000;
        continue;
      }

      const unitBulk = RESOURCES[stream.resourceId]?.sizeClass ?? 1;
      if (usedStorage + unitBulk > maxStorage) continue;

      const maxBySpace = Math.floor((maxStorage - usedStorage) / unitBulk);
      const maxByDeposit = stream.remaining !== null ? stream.remaining : Infinity;
      const cap = Math.min(maxBySpace, maxByDeposit);
      if (cap <= 0) continue;

      const acc = (nextCarry[carryKey] ?? 0) + stream.ratePerDay * deltaDays;
      const whole = Math.min(cap, Math.floor(acc + 1e-9));

      if (whole > 0) {
        nextInventory[stream.resourceId] = (nextInventory[stream.resourceId] ?? 0) + whole;
        usedStorage += whole * unitBulk;

        if (def.id === 'mine' && stream.oreId) {
          detail.oreLeft = {
            ...detail.oreLeft,
            [stream.oreId]: Math.max(0, (detail.oreLeft?.[stream.oreId] ?? 0) - whole),
          };
        } else if (def.id === 'timber_camp') {
          detail.forestLeft = Math.max(0, (detail.forestLeft ?? 0) - whole);
        } else if (def.id === 'clay_pit') {
          detail.clayLeft = Math.max(0, (detail.clayLeft ?? 0) - whole);
        } else if (def.id === 'quarry') {
          detail.stoneLeft = Math.max(0, (detail.stoneLeft ?? 0) - whole);
        }
      }

      nextCarry[carryKey] = Math.round((acc - whole) * 10000) / 10000;
    }
  }

  return {
    inventory: nextInventory,
    water: nextWater,
    tileDetails: nextTileDetails,
    productionCarry: nextCarry,
  };
}

/** Grace days after construction or full repair before daily building decay begins. */
export const BUILDING_DEGRADATION_GRACE_DAYS = 3;

/** Average active building condition (%) below which a village collapses as Abandoned. */
export const VILLAGE_ABANDON_AVG_CONDITION = 20;

/** Maps fertilizer resource IDs to Crop Field nutrients: N (Manure), P (Bone Meal), K (Wood Ash). */
export const FERTILIZER_TO_NUTRIENT = Object.freeze({
  manure: 'N',
  bone_meal: 'P',
  wood_ash: 'K',
});

/** Normalizes legacy `A/B/C` soil nutrient keys into `N/P/K`. */
function normalizeCropNutrients(raw) {
  return {
    N: raw?.N ?? raw?.A ?? 100,
    P: raw?.P ?? raw?.B ?? 100,
    K: raw?.K ?? raw?.C ?? 100,
  };
}

/** Creates a default empty Crop Field plot state (64 slots, nutrients N/P/K at 100). */
export function createEmptyCropPlot() {
  return {
    cropId: null,
    plantedSlots: 0,
    survivingSlots: 0,
    grownDays: 0,
    matureDays: 0,
    status: 'empty',
    nutrients: { N: 100, P: 100, K: 100 },
  };
}

/** Creates a default empty Orchard plot state (9 tree slots). */
export function createEmptyOrchardPlot() {
  return {
    treeId: 'apple_tree',
    plantedSlots: 0,
    survivingSlots: 0,
    grownDays: 0,
    lastHarvestYear: 0,
  };
}

/**
 * Advances all Crop Fields and Orchards by `elapsedDays` in-game days:
 * - Crop Fields grow over `60` days, enter `30`-day harvest window, and wither if unharvested or outside safe °C.
 * - Unconsumed nutrients `N/P/K` regenerate `+2%/day`.
 * - Orchards take `336` days to mature and sustain frost/heat losses outside `[minTempC, maxTempC]`.
 *
 * @param {object} params
 * @returns {Record<string, object>} Updated sparse tileDetails map.
 */
export function advanceCropFieldsAndOrchards({
  buildings = [],
  tileDetails = {},
  ambientTempC = 15,
  elapsedDays = 1,
}) {
  if (elapsedDays <= 0) return tileDetails;
  const nextDetails = { ...tileDetails };

  for (const bld of buildings) {
    if (bld.status && bld.status !== 'active') continue;
    const key = `${bld.x},${bld.y}`;

    if (bld.buildingId === 'crop_field') {
      const detail = { ...(nextDetails[key] ?? {}) };
      const plot = detail.cropPlot
        ? { ...detail.cropPlot, nutrients: normalizeCropNutrients(detail.cropPlot.nutrients) }
        : createEmptyCropPlot();

      for (let d = 0; d < elapsedDays; d += 1) {
        // Regenerate N/P/K nutrients naturally each day when not actively drained.
        const crop = plot.cropId ? CROPS[plot.cropId] : null;
        for (const nKey of ['N', 'P', 'K']) {
          if (!crop || crop.nutrientType !== nKey || plot.status === 'empty' || plot.status === 'withered') {
            plot.nutrients[nKey] = Math.min(100, Math.round((plot.nutrients[nKey] + 2) * 10) / 10);
          }
        }

        if (!crop || plot.survivingSlots <= 0 || plot.status === 'empty' || plot.status === 'withered') continue;

        if (ambientTempC < crop.minTempC || ambientTempC > crop.maxTempC) {
          plot.survivingSlots = Math.max(0, Math.floor(plot.survivingSlots * 0.85));
          if (plot.survivingSlots === 0) {
            plot.status = 'withered';
            continue;
          }
        }

        if (plot.status === 'growing') {
          plot.grownDays += 1;
          const drainPerDay = crop.nutrientCost / crop.growthDays;
          plot.nutrients[crop.nutrientType] = Math.max(0, plot.nutrients[crop.nutrientType] - drainPerDay);
          if (plot.grownDays >= crop.growthDays) {
            plot.status = 'ready';
          }
        } else if (plot.status === 'ready') {
          plot.matureDays += 1;
          if (plot.matureDays >= crop.harvestWindowDays) {
            plot.status = 'withered';
            plot.survivingSlots = 0;
          }
        }
      }

      detail.cropPlot = plot;
      nextDetails[key] = detail;
    }

    if (bld.buildingId === 'orchard') {
      const detail = { ...(nextDetails[key] ?? {}) };
      const plot = detail.orchardPlot ? { ...detail.orchardPlot } : createEmptyOrchardPlot();
      const tree = ORCHARD_TREES[plot.treeId] ?? ORCHARD_TREES.apple_tree;

      for (let d = 0; d < elapsedDays; d += 1) {
        if (plot.survivingSlots <= 0) break;
        if (ambientTempC < tree.minTempC || ambientTempC > tree.maxTempC) {
          plot.survivingSlots = Math.max(0, plot.survivingSlots - 1);
          if (plot.survivingSlots === 0) break;
        }
        if (plot.grownDays < tree.matureDays) {
          plot.grownDays += 1;
        }
      }

      detail.orchardPlot = plot;
      nextDetails[key] = detail;
    }
  }

  return nextDetails;
}

/**
 * Harvests a ready `Crop Field`, returning produced crop units scaled by surviving slots,
 * nutrient health factor, and Hoe tool yieldBonus.
 *
 * @param {object} params
 * @returns {{ harvestedQty: number, itemId: string | null, plot: object }}
 */
export function resolveCropHarvest({ plot, unlockedTechs = [] }) {
  if (!plot || plot.status !== 'ready' || !plot.cropId || plot.survivingSlots <= 0) {
    return {
      harvestedQty: 0,
      itemId: null,
      secondaryItemId: null,
      secondaryQty: 0,
      items: {},
      plot: plot ?? createEmptyCropPlot(),
    };
  }
  const crop = CROPS[plot.cropId];
  const normalizedNutrients = normalizeCropNutrients(plot.nutrients);
  const hoeTool = getBestUnlockedTool(unlockedTechs, 'hoe');
  const sickleTool = getBestUnlockedTool(unlockedTechs, 'sickle');
  const toolBonus = (hoeTool?.modifiers?.yieldBonus ?? 0) + (sickleTool?.modifiers?.yieldBonus ?? 0);
  const nutrientFactor = Math.max(0.35, Math.min(1, 0.35 + (normalizedNutrients[crop.nutrientType] ?? 0) / 150));
  const avgYield = (crop.yieldMin + crop.yieldMax) / 2 + toolBonus;
  const harvestedQty = Math.max(1, Math.round(plot.survivingSlots * avgYield * nutrientFactor));

  const secondaryItemId = crop.secondaryHarvestItemId ?? null;
  const secondaryQty =
    secondaryItemId && crop.secondaryYieldRatio > 0
      ? Math.max(1, Math.round(harvestedQty * crop.secondaryYieldRatio))
      : 0;
  const items = { [crop.harvestItemId]: harvestedQty };
  if (secondaryItemId && secondaryQty > 0) {
    items[secondaryItemId] = (items[secondaryItemId] ?? 0) + secondaryQty;
  }

  return {
    harvestedQty,
    itemId: crop.harvestItemId,
    secondaryItemId,
    secondaryQty,
    items,
    plot: {
      ...createEmptyCropPlot(),
      nutrients: normalizedNutrients,
    },
  };
}

/**
 * Seeds up to 64 slots of a Crop Field using available Spring grain/seeds (supports partial planting like 42/64).
 *
 * @param {object} params
 * @param {object} params.plot - Current crop plot state.
 * @param {string} params.cropId - Target crop (`grain` | `flax` | `vegetables`).
 * @param {number} params.availableSeedQty - Seed/grain units available to plant.
 * @returns {{ planted: number, plot: object }} Number of seeds consumed and updated plot.
 */
export function plantCropPlot({ plot, cropId, availableSeedQty }) {
  const crop = CROPS[cropId];
  const current = plot ?? createEmptyCropPlot();
  if (!crop || current.status !== 'empty' || availableSeedQty <= 0) {
    return { planted: 0, plot: current };
  }
  const planted = Math.min(crop.slotsPerField, Math.max(0, Math.floor(availableSeedQty)));
  if (planted <= 0) return { planted: 0, plot: current };

  return {
    planted,
    plot: {
      ...current,
      cropId,
      plantedSlots: planted,
      survivingSlots: planted,
      grownDays: 0,
      matureDays: 0,
      status: 'growing',
    },
  };
}

/**
 * Applies 1 organic fertilizer item to restore +25 points to its paired nutrient:
 * - `manure` -> Nitrogen (`N`)
 * - `bone_meal` -> Phosphorus (`P`)
 * - `wood_ash` -> Potassium (`K`)
 *
 * @param {object} plot
 * @param {string} [itemId='manure']
 * @returns {object} Updated crop plot.
 */
export function fertilizeCropPlot(plot, itemId = 'manure') {
  const current = plot ?? createEmptyCropPlot();
  const nutrients = normalizeCropNutrients(current.nutrients);
  const targetKey = FERTILIZER_TO_NUTRIENT[itemId] ?? 'N';

  return {
    ...current,
    nutrients: {
      ...nutrients,
      [targetKey]: Math.min(100, Math.round(((nutrients[targetKey] ?? 0) + 25) * 10) / 10),
    },
  };
}

/**
 * Plants saplings into up to 9 empty Orchard slots.
 *
 * @param {object} params
 * @returns {{ planted: number, plot: object }} Saplings planted and updated orchard state.
 */
export function plantOrchardPlot({ plot, treeId = 'apple_tree', availableSaplings = 0 }) {
  const tree = ORCHARD_TREES[treeId] ?? ORCHARD_TREES.apple_tree;
  const current = plot ?? createEmptyOrchardPlot();
  const freeSlots = Math.max(0, tree.slotsPerOrchard - current.survivingSlots);
  const planted = Math.min(freeSlots, Math.max(0, Math.floor(availableSaplings)));
  if (planted <= 0) return { planted: 0, plot: current };

  return {
    planted,
    plot: {
      ...current,
      treeId: tree.id,
      plantedSlots: current.plantedSlots + planted,
      survivingSlots: current.survivingSlots + planted,
    },
  };
}

/**
 * Harvests an annual yield from a mature Orchard during Summer or Autumn (once per calendar year).
 *
 * @param {object} params
 * @returns {{ harvestedQty: number, itemId: string | null, plot: object }}
 */
export function resolveOrchardHarvest({ plot, season, year, unlockedTechs = [] }) {
  const current = plot ?? createEmptyOrchardPlot();
  const tree = ORCHARD_TREES[current.treeId] ?? ORCHARD_TREES.apple_tree;
  if (
    current.survivingSlots <= 0 ||
    current.grownDays < tree.matureDays ||
    !tree.harvestSeasons.includes(season) ||
    current.lastHarvestYear >= year
  ) {
    return { harvestedQty: 0, itemId: null, plot: current };
  }

  const hoeBonus = getBestUnlockedTool(unlockedTechs, 'hoe')?.modifiers?.yieldBonus ?? 0;
  const harvestedQty = current.survivingSlots * (tree.yieldPerTree + hoeBonus);

  return {
    harvestedQty,
    itemId: tree.outputItemId,
    plot: {
      ...current,
      lastHarvestYear: year,
    },
  };
}

/**
 * Deterministically rolls a wild animal capture during a Forest Hunt when the village
 * owns an active Farmstead + Animal Pen with free capacity and a Spear tech.
 *
 * @param {object} params
 * @returns {{ captured: boolean, animalId: string | null }}
 */
export function rollWildAnimalCapture({ unlockedTechs = [], rng }) {
  const unlocked = new Set(unlockedTechs);
  const captureChance = unlocked.has('bronze_spear')
    ? 0.45
    : unlocked.has('copper_spear')
      ? 0.35
      : unlocked.has('stone_spear')
        ? 0.25
        : 0;
  if (captureChance <= 0 || typeof rng !== 'function' || rng() >= captureChance) {
    return { captured: false, animalId: null };
  }

  const speciesList = Object.values(LIVESTOCK);
  const totalWeight = speciesList.reduce((sum, s) => sum + s.captureWeight, 0);
  let cursor = rng() * totalWeight;
  for (const spec of speciesList) {
    if (cursor < spec.captureWeight) {
      return { captured: true, animalId: spec.id };
    }
    cursor -= spec.captureWeight;
  }
  return { captured: true, animalId: speciesList[0].id };
}

/**
 * Feeds Livestock in active Animal Pens (1 grain + 1 water bowl/day) and collects
 * daily Manure plus Milk, Wool, and Eggs.
 *
 * @param {object} params
 * @returns {{
 *   inventory: Record<string, number>,
 *   water: number,
 *   produced: Record<string, number>,
 *   unfedAnimals: number,
 * }} Post-livestock inventory and daily outputs.
 */
export function advanceDailyLivestock({ animals = {}, inventory = {}, water = 0 }) {
  const nextInventory = { ...inventory };
  let nextWater = water;
  const produced = {};
  let unfedAnimals = 0;

  for (const [animalId, count] of Object.entries(animals ?? {})) {
    const qty = Math.max(0, Math.floor(count));
    if (qty <= 0) continue;
    const spec = LIVESTOCK[animalId];
    if (!spec) continue;

    const availFeed = nextInventory[spec.feedItemId] ?? 0;
    const maxFedByFood = Math.floor(availFeed / spec.dailyFeedQty);
    const maxFedByWater = Math.floor(nextWater / spec.dailyWaterBowls);
    const fedCount = Math.min(qty, maxFedByFood, maxFedByWater);
    unfedAnimals += qty - fedCount;

    if (fedCount > 0) {
      nextInventory[spec.feedItemId] = availFeed - fedCount * spec.dailyFeedQty;
      if (nextInventory[spec.feedItemId] <= 0) delete nextInventory[spec.feedItemId];
      nextWater -= fedCount * spec.dailyWaterBowls;

      const manureQty = fedCount * spec.dailyManure;
      if (manureQty > 0) produced.manure = (produced.manure ?? 0) + manureQty;
      if (spec.dailyOutputId && spec.dailyOutputQty > 0) {
        const outQty = fedCount * spec.dailyOutputQty;
        produced[spec.dailyOutputId] = (produced[spec.dailyOutputId] ?? 0) + outQty;
      }
    }
  }

  return { inventory: nextInventory, water: nextWater, produced, unfedAnimals };
}

/**
 * Plans a Continent Map expedition from `from` to `to`, calculating scaled distance
 * (`tileDistance * 25 * 0.5 km`), travel duration, food/water ration cost, and Caravan capacity.
 *
 * @param {object} params
 * @returns {{
 *   distanceTiles: number,
 *   distanceKm: number,
 *   slowestSpeedKmPerHour: number,
 *   totalPop: number,
 *   carryCapacity: number,
 *   foodNeeded: number,
 *   waterNeeded: number,
 *   oneWayTravelMs: number,
 *   workMs: number,
 *   arrivesAtMs: number,
 *   completedAtMs: number,
 *   returnsAtMs: number,
 * }} Expedition cost, capacity, and round-trip timestamps.
 */
export function calculateContinentExpeditionPlan({
  from,
  to,
  units = {},
  nowMs = 0,
  efficiencyPenalty = 0,
}) {
  const activeEntries = Object.entries(units ?? {}).filter(
    ([id, q]) => UNITS[id] && Number(q) > 0,
  );
  if (activeEntries.length === 0) {
    throw new RangeError('Continent expedition requires at least 1 unit.');
  }

  const distanceTiles = Math.hypot(to.x - from.x, to.y - from.y);
  const distanceKm = distanceTiles * CONTINENT_TILE_DISTANCE_KM;
  const effMult = Math.max(0.2, 1 - efficiencyPenalty);

  const slowestSpeedKmPerHour = Math.min(
    ...activeEntries.map(([id]) => UNITS[id].speedKmPerHour),
  );
  const maxWorkHours = Math.max(
    1,
    ...activeEntries.map(([id]) => UNITS[id].workDurationHours || 1),
  );

  const totalPop = activeEntries.reduce(
    (sum, [id, q]) => sum + Math.floor(q) * UNITS[id].popCost,
    0,
  );
  const carryCapacity = activeEntries.reduce(
    (sum, [id, q]) => sum + Math.floor(q) * (UNITS[id].carryCapacity ?? 0),
    0,
  );

  const oneWayHours = distanceKm / (slowestSpeedKmPerHour * effMult);
  const workHours = maxWorkHours / effMult;
  const totalHours = oneWayHours * 2 + workHours;
  const totalDays = Math.max(1, Math.ceil(totalHours / HOURS_PER_INGAME_DAY));

  const oneWayTravelMs = Math.round(oneWayHours * REAL_MS_PER_INGAME_HOUR);
  const workMs = Math.round(workHours * REAL_MS_PER_INGAME_HOUR);
  const arrivesAtMs = nowMs + oneWayTravelMs;
  const completedAtMs = arrivesAtMs + workMs;

  return {
    distanceTiles,
    distanceKm,
    slowestSpeedKmPerHour,
    totalPop,
    carryCapacity,
    foodNeeded: totalPop * totalDays,
    waterNeeded: totalPop * totalDays,
    oneWayTravelMs,
    workMs,
    arrivesAtMs,
    completedAtMs,
    returnsAtMs: completedAtMs + oneWayTravelMs,
  };
}

/**
 * Resolves completing a Continent Map expedition upon return:
 * - Scouts reveal a `3x3` Continent fog ring around `(targetX, targetY)`.
 * - Scouts / Prospectors record target tile `rockType` and `availableOres`.
 * - Gatherers / Hunters / Prospectors collect loot, ONLY bringing physical items home when `caravan > 0` (bounded by Caravan carry capacity).
 *
 * @param {object} params
 * @returns {{
 *   continentFog: Uint8Array,
 *   newlyRevealedCount: number,
 *   tileIntel: { biome: string, rockType: string, availableOres: string[] },
 *   itemsBroughtBack: Record<string, number>,
 *   capturedAnimal: string | null,
 *   intelOnly: boolean,
 * }} Expedition outcome payload.
 */
export function resolveContinentExpedition({
  continentFog,
  continentSize,
  targetTile,
  targetRockOres = [],
  units = {},
  rng,
}) {
  const scouts = Math.max(0, Math.floor(units.scout ?? 0));
  const cavalry = Math.max(0, Math.floor(units.cavalry ?? 0));
  const caravans = Math.max(0, Math.floor(units.caravan ?? 0));
  const boats =
    Math.max(0, Math.floor(units.fishing_boat ?? 0)) +
    Math.max(0, Math.floor(units.transport_ship ?? 0));
  const gatherers = Math.max(0, Math.floor(units.gatherer ?? 0));
  const hunters = Math.max(0, Math.floor(units.hunter ?? 0));
  const soldiers =
    Math.max(0, Math.floor(units.spearman ?? 0)) +
    Math.max(0, Math.floor(units.swordsman ?? 0)) +
    Math.max(0, Math.floor(units.archer ?? 0)) +
    cavalry;
  const prospectors = Math.max(0, Math.floor(units.prospector ?? 0));

  let nextFog = new Uint8Array(continentFog);
  let newlyRevealedCount = 0;

  if (scouts > 0 || cavalry > 0) {
    const rev = revealBox3x3(continentFog, continentSize, targetTile.x, targetTile.y, {
      requireCenterExplored: false,
      radius: 1,
    });
    nextFog = rev.fog;
    newlyRevealedCount = rev.newlyRevealedCount;
  }

  const rawLoot = {};
  const addLoot = (id, qty) => {
    rawLoot[id] = (rawLoot[id] ?? 0) + qty;
  };

  if (gatherers > 0) {
    addLoot('wood_logs', gatherers * (1 + Math.floor(rng() * 3)));
    addLoot('small_stones', gatherers * (1 + Math.floor(rng() * 2)));
  }

  if (prospectors > 0 && targetRockOres.length > 0) {
    const oreId = targetRockOres[Math.floor(rng() * targetRockOres.length)];
    addLoot(resolveMinedOreResourceId(oreId), prospectors * (2 + Math.floor(rng() * 3)));
  }

  let capturedAnimal = null;
  if (hunters > 0 || soldiers > 0) {
    const huntCount = hunters + Math.floor(soldiers / 2);
    if (huntCount > 0) {
      addLoot('meat', huntCount * (2 + Math.floor(rng() * 2)));
      addLoot('pelts', huntCount * (1 + Math.floor(rng() * 2)));
    }
    if (caravans > 0 && hunters > 0 && rng() < 0.35) {
      const animalIds = Object.keys(LIVESTOCK);
      capturedAnimal = animalIds[Math.floor(rng() * animalIds.length)];
    }
  }

  if (boats > 0 && (targetTile?.isWater || targetTile?.biome === 'ocean' || targetTile?.biome === 'coast')) {
    addLoot('fish', boats * (4 + Math.floor(rng() * 4)));
  }

  const maxCarryBulk = Object.entries(units ?? {}).reduce(
    (sum, [id, q]) => sum + Math.max(0, Math.floor(Number(q) || 0)) * (UNITS[id]?.carryCapacity ?? 0),
    0,
  );
  const itemsBroughtBack = {};
  let usedCarry = 0;

  if (maxCarryBulk > 0) {
    for (const [id, qty] of Object.entries(rawLoot)) {
      const bulk = RESOURCES[id]?.sizeClass ?? 2;
      for (let i = 0; i < qty; i += 1) {
        if (usedCarry + bulk <= maxCarryBulk) {
          itemsBroughtBack[id] = (itemsBroughtBack[id] ?? 0) + 1;
          usedCarry += bulk;
        }
      }
    }
  }

  return {
    continentFog: nextFog,
    newlyRevealedCount,
    tileIntel: {
      biome: targetTile.biome,
      rockType: targetTile.rockType,
      availableOres: [...targetRockOres],
    },
    itemsBroughtBack,
    capturedAnimal,
    intelOnly: maxCarryBulk === 0,
  };
}

/** Validates building tech prerequisite names safely against TECHNOLOGIES registry. */
export function hasUnlockedTechForBuilding(buildingId, unlockedTechs = []) {
  const def = BUILDINGS[buildingId];
  if (!def) return false;
  const unlockedSet = new Set(unlockedTechs);
  return def.requiredTechs.every((t) => unlockedSet.has(t) && Boolean(TECHNOLOGIES[t]));
}

/**
 * Computes normalized static attribute totals for a building at a specific `(tier, level)` state.
 * Matches `calculateMaxPopulation`, `calculateStorageCapacity`, `calculateWaterCapacity`,
 * `calculateFarmSeedCapacity`, `calculateFarmMaxAttachments`, `calculateAnimalPenCapacity`, and `getWallBonuses`.
 *
 * @param {object} def - Building template from `BUILDINGS`.
 * @param {number} tier - Tier to evaluate.
 * @param {number} level - Level within tier (0 supported for unbuilt City Wall).
 * @returns {Record<string, number>} Normalized attribute snapshot.
 */
function computeBuildingStatsSnapshot(def, tier, level) {
  if (!def || level <= 0) {
    return {
      popCap: 0,
      storage: 0,
      preservedStorage: 0,
      waterCap: 0,
      productionPerDay: 0,
      seedVault: 0,
      maxAttachments: 0,
      penCapacity: 0,
      wallDefensePercent: 0,
    };
  }

  const clampedLevel = Math.max(1, Math.min(level, def.maxLevel));

  const popCap = def.popTierBases
    ? calculateTierLevelValue(def.popTierBases, tier, clampedLevel, def.maxLevel)
    : def.popBonusPerLevel > 0
      ? def.popBonusPerLevel * clampedLevel
      : 0;

  const storage =
    def.id !== 'farm' && def.storageTierBases
      ? calculateTierLevelValue(def.storageTierBases, tier, clampedLevel, def.maxLevel)
      : def.id !== 'farm' && def.storageBonusPerLevel > 0
        ? def.storageBonusPerLevel * clampedLevel
        : 0;

  const preservedStorage = def.preservedStorageTierBases
    ? calculateTierLevelValue(def.preservedStorageTierBases, tier, clampedLevel, def.maxLevel)
    : def.preservedStorageBonusPerLevel > 0
      ? def.preservedStorageBonusPerLevel * clampedLevel
      : 0;

  let waterCap = 0;
  if (tier === 1 && Array.isArray(def.waterCapacityByLevel) && def.waterCapacityByLevel.length > 0) {
    waterCap = def.waterCapacityByLevel[Math.min(clampedLevel - 1, def.waterCapacityByLevel.length - 1)];
  } else if (def.waterTierBases) {
    waterCap = calculateTierLevelValue(def.waterTierBases, tier, clampedLevel, def.maxLevel);
  } else if (def.waterCapacity > 0) {
    waterCap = def.waterCapacity * clampedLevel;
  }

  const productionPerDay = def.productionTierBases
    ? calculateTierLevelValue(def.productionTierBases, tier, clampedLevel, def.maxLevel)
    : 0;

  const seedVault =
    def.id === 'farm' && def.storageTierBases
      ? calculateTierLevelValue(def.storageTierBases, tier, clampedLevel, def.maxLevel)
      : 0;

  const maxAttachments = def.attachmentTierBases
    ? calculateTierLevelValue(def.attachmentTierBases, tier, clampedLevel, def.maxLevel)
    : 0;

  const penCapacity = def.penCapacityTierBases
    ? calculateTierLevelValue(def.penCapacityTierBases, tier, clampedLevel, def.maxLevel)
    : 0;

  const wallDefensePercent = def.defenseTierBases
    ? calculateTierLevelValue(def.defenseTierBases, tier, clampedLevel, def.maxLevel)
    : 0;

  return {
    popCap,
    storage,
    preservedStorage,
    waterCap,
    productionPerDay,
    seedVault,
    maxAttachments,
    penCapacity,
    wallDefensePercent,
  };
}

const PREVIEW_METRIC_SPECS = [
  { key: 'popCap', label: 'Max Pop', unit: '' },
  { key: 'storage', label: 'Storage', unit: '' },
  { key: 'preservedStorage', label: 'Granary Storage', unit: '' },
  { key: 'waterCap', label: 'Water Cap', unit: ' bowls' },
  { key: 'productionPerDay', label: 'Base Output', unit: '/day' },
  { key: 'seedVault', label: 'Seed Vault', unit: '' },
  { key: 'maxAttachments', label: 'Farm Attachments', unit: '' },
  { key: 'penCapacity', label: 'Livestock Cap', unit: '' },
  { key: 'wallDefensePercent', label: 'Wall Defense', unit: '%' },
];

function diffBuildingStatSnapshots(currentStats, targetStats) {
  const metrics = [];
  for (const spec of PREVIEW_METRIC_SPECS) {
    const curVal = currentStats[spec.key] ?? 0;
    const nextVal = targetStats[spec.key] ?? 0;
    const delta = nextVal - curVal;
    if (delta !== 0) {
      metrics.push({
        key: spec.key,
        label: spec.label,
        current: curVal,
        next: nextVal,
        delta,
        unit: spec.unit,
      });
    }
  }
  const summary =
    metrics.length > 0
      ? metrics
          .map((m) => `${m.delta > 0 ? `+${m.delta}` : m.delta}${m.unit} ${m.label}`)
          .join(' · ')
      : 'Advances upgrade readiness toward the next Tier';
  return { metrics, summary };
}

/**
 * Computes exact stat deltas (`+pop`, `+storage`, `+water`, `+rate/day`, etc.) for a building's
 * next Level upgrade and next Tier advancement so the UI displays transparent upgrade gains.
 *
 * @param {{ building: { buildingId: string, tier?: number, level?: number } }} params
 * @returns {{
 *   current: Record<string, number>,
 *   nextLevel: { targetLevel: number, metrics: Array<object>, summary: string } | null,
 *   nextTier: { targetTier: number, resetLevel: number, metrics: Array<object>, summary: string } | null,
 * }} Upgrade preview summary.
 */
export function getBuildingUpgradePreview({ building }) {
  const def = building ? BUILDINGS[building.buildingId] : null;
  if (!building || !def) {
    return { current: {}, nextLevel: null, nextTier: null };
  }

  const currentTier = building.tier ?? def.tier;
  const currentLevel = building.level ?? 0;
  const current = computeBuildingStatsSnapshot(def, currentTier, currentLevel);

  let nextLevel = null;
  if (currentLevel < def.maxLevel) {
    const targetLevel = currentLevel + 1;
    const nextStats = computeBuildingStatsSnapshot(def, currentTier, targetLevel);
    nextLevel = {
      targetLevel,
      ...diffBuildingStatSnapshots(current, nextStats),
    };
  }

  let nextTier = null;
  if (currentTier < def.maxTier) {
    const targetTier = currentTier + 1;
    // Main Age advances keep its current level, whereas production/housing structures reset to Lv 1.
    const resetLevel = def.id === 'main' ? Math.max(1, currentLevel) : 1;
    const nextStats = computeBuildingStatsSnapshot(def, targetTier, resetLevel);
    nextTier = {
      targetTier,
      resetLevel,
      ...diffBuildingStatSnapshots(current, nextStats),
    };
  }

  return { current, nextLevel, nextTier };
}

/**
 * Aggregates all active daily village resource production streams (`/day`) across extraction
 * buildings (Mine, Timber Camp, Quarry, Clay Pit, Well) and livestock in Animal Pens.
 *
 * @param {object} params
 * @returns {Array<{
 *   resourceId: string,
 *   name: string,
 *   ratePerDay: number,
 *   remaining: number | null,
 *   sources: string[],
 * }>} Sorted daily production summary entries.
 */
export function getVillageDailyProductionSummary({
  buildings = [],
  territory,
  tileDetails = {},
  unlockedTechs = [],
  efficiencyPenalty = 0,
  animals = {},
}) {
  const map = new Map();
  const addEntry = (resourceId, name, ratePerDay, sourceLabel, remaining = null) => {
    if (!ratePerDay || ratePerDay <= 0) return;
    const existing = map.get(resourceId) ?? {
      resourceId,
      name,
      ratePerDay: 0,
      remaining: null,
      sources: [],
    };
    existing.ratePerDay = Math.round((existing.ratePerDay + ratePerDay) * 100) / 100;
    if (remaining !== null && remaining !== undefined) {
      existing.remaining = (existing.remaining ?? 0) + remaining;
    }
    if (sourceLabel && !existing.sources.includes(sourceLabel)) {
      existing.sources.push(sourceLabel);
    }
    map.set(resourceId, existing);
  };

  const size = territory?.size ?? 25;
  for (const building of buildings ?? []) {
    if (building.status && building.status !== 'active') continue;
    const def = BUILDINGS[building.buildingId];
    if (!def?.productionTierBases) continue;
    const tile = territory?.tiles?.[building.y * size + building.x];
    if (!tile) continue;
    const detail = tileDetails?.[`${building.x},${building.y}`] ?? {};
    const streams = getBuildingDailyProduction({
      building,
      tile,
      tileDetail: detail,
      territory,
      unlockedTechs,
      efficiencyPenalty,
    });
    for (const s of streams) {
      const displayName = s.resourceId === 'water' ? 'Water (Well)' : (RESOURCES[s.resourceId]?.name ?? s.resourceId);
      addEntry(s.resourceId, displayName, s.ratePerDay, def.name, s.remaining);
    }
  }

  if (calculateAnimalPenCapacity(buildings) > 0) {
    for (const [animalId, rawCount] of Object.entries(animals ?? {})) {
      const qty = Math.max(0, Math.floor(rawCount));
      const spec = LIVESTOCK[animalId];
      if (!spec || qty <= 0) continue;
      if (spec.dailyManure > 0) {
        addEntry('manure', RESOURCES.manure?.name ?? 'Manure', qty * spec.dailyManure, 'Animal Pen');
      }
      if (spec.dailyOutputId && spec.dailyOutputQty > 0) {
        addEntry(
          spec.dailyOutputId,
          RESOURCES[spec.dailyOutputId]?.name ?? spec.dailyOutputId,
          qty * spec.dailyOutputQty,
          'Animal Pen',
        );
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.ratePerDay - a.ratePerDay);
}

/**
 * Advances daily structural wear across active buildings after their 3-day grace buffer expires.
 * Winter doubles wear (4%/day vs 2%/day), reduced up to -80% by City Walls.
 * Collapses the village as Abandoned when average active building condition drops below `20%`.
 *
 * @param {object} params
 * @returns {{ buildings: Array<object>, averageCondition: number, abandonedByDegradation: boolean }}
 */
export function advanceDailyBuildingDegradation({
  buildings = [],
  wall = null,
  season = 'spring',
  elapsedDays = 1,
}) {
  const days = Math.max(0, Math.floor(elapsedDays));
  const dailyBase = season === 'winter' ? 4 : 2;

  let activeCount = 0;
  let condSum = 0;
  const nextBuildings = (buildings ?? []).map((b) => {
    if (b.status && b.status !== 'active') return b;
    const protection = getEffectiveTileProtection({
      buildings,
      wall,
      x: b.x ?? 12,
      y: b.y ?? 12,
    }).degradationReduction;
    const wearPerDay = Math.round(dailyBase * (1 - protection) * 100) / 100;
    let grace = b.graceDaysRemaining ?? BUILDING_DEGRADATION_GRACE_DAYS;
    let cond = b.condition ?? 100;

    for (let d = 0; d < days; d += 1) {
      if (grace > 0) {
        grace -= 1;
      } else {
        cond = Math.max(0, Math.round((cond - wearPerDay) * 100) / 100);
      }
    }

    activeCount += 1;
    condSum += cond;
    return { ...b, condition: cond, graceDaysRemaining: grace };
  });

  const averageCondition =
    activeCount > 0 ? Math.round((condSum / activeCount) * 100) / 100 : 100;
  const abandonedByDegradation =
    activeCount > 0 && averageCondition < VILLAGE_ABANDON_AVG_CONDITION;

  return { buildings: nextBuildings, averageCondition, abandonedByDegradation };
}

/**
 * Computes material cost to repair a single damaged building back to 100% condition.
 * Cost scales linearly with missing durability and `0.5x` scaled tier/level build cost.
 *
 * @param {object} building
 * @returns {Record<string, number>} Required repair items.
 */
export function calculateBuildingRepairCost(building) {
  if (!building) return {};
  const cond = Math.max(0, Math.min(100, building.condition ?? 100));
  const missing = 100 - cond;
  if (missing <= 0) return {};

  const def = BUILDINGS[building.buildingId];
  if (!def) return {};
  const baseCost =
    Object.keys(def.cost ?? {}).length > 0 ? def.cost : { sticks: 8, pelts: 5, straw: 5 };
  const scale = (building.tier ?? def.tier ?? 1) * (building.level ?? 1) * (missing / 100) * 0.5;

  const repairCost = {};
  for (const [resId, qty] of Object.entries(baseCost)) {
    const needed = Math.max(1, Math.ceil(qty * scale));
    if (needed > 0) repairCost[resId] = needed;
  }
  return repairCost;
}

/**
 * Aggregates material costs to repair every damaged active building in the settlement.
 *
 * @param {Array<object>} buildings
 * @returns {Record<string, number>} Combined repair cost map.
 */
export function calculateRepairAllCost(buildings = []) {
  const combined = {};
  for (const bld of buildings ?? []) {
    const cost = calculateBuildingRepairCost(bld);
    for (const [resId, qty] of Object.entries(cost)) {
      combined[resId] = (combined[resId] ?? 0) + qty;
    }
  }
  return combined;
}

/**
 * Validates whether a building can be demolished cleanly without dropping population housing below
 * active `popUsed` or stranding attached Crop Fields / Animal Pens / Orchards.
 *
 * @param {object} params
 * @returns {{ allowed: boolean, reason: string | null }} Demolish permission check.
 */
export function canDemolishBuilding({
  building,
  buildings = [],
  units = {},
  starvationPopLoss = 0,
}) {
  if (!building || building.buildingId === 'main') {
    return { allowed: false, reason: 'Cannot destroy Main Village Hall.' };
  }

  const after = buildings.filter((b) => b.instanceId !== building.instanceId);
  const afterMaxPop = Math.max(0, calculateMaxPopulation(after) - starvationPopLoss);
  const afterPopUsed = calculatePopUsed({ units, buildings: after });
  if (afterPopUsed > afterMaxPop) {
    return {
      allowed: false,
      reason: 'Insufficient remaining housing capacity for active population.',
    };
  }

  if (building.buildingId === 'farm') {
    const attachmentsUsed = after.filter(
      (b) =>
        b.buildingId === 'crop_field' || b.buildingId === 'animal_pen' || b.buildingId === 'orchard',
    ).length;
    if (attachmentsUsed > calculateFarmMaxAttachments(after)) {
      return {
        allowed: false,
        reason: 'Destroy attached Fields, Pens, or Orchards first.',
      };
    }
  }

  return { allowed: true, reason: null };
}

/**
 * Slaughters `count` animals of `animalId` from Animal Pens, returning butchered Meat, Bones & Pelts.
 *
 * @param {object} params
 * @returns {{ animals: Record<string, number>, slaughtered: number, yields: Record<string, number> }}
 */
export function slaughterLivestock({ animals = {}, animalId, count = 1, unlockedTechs = [] }) {
  const spec = LIVESTOCK[animalId];
  const have = Math.max(0, Math.floor(animals?.[animalId] ?? 0));
  const slaughtered = spec ? Math.min(have, Math.max(0, Math.floor(Number(count) || 0))) : 0;
  if (!spec || slaughtered <= 0) {
    return { animals: { ...animals }, slaughtered: 0, yields: {} };
  }

  const knifeYield = getBestUnlockedTool(unlockedTechs, 'knife')?.modifiers?.yieldBonus ?? 0;
  const nextAnimals = { ...animals, [animalId]: have - slaughtered };
  const yields = {};
  for (const [resId, qty] of Object.entries(spec.slaughterYield ?? {})) {
    if (qty > 0) yields[resId] = qty * slaughtered;
  }
  if (knifeYield > 0 && yields.meat) {
    yields.meat += knifeYield * slaughtered;
  }

  return { animals: nextAnimals, slaughtered, yields };
}

/**
 * Evaluates Option B Barracks batch equipment refit from Tier 2 (Copper) -> Tier 3 (Bronze)
 * for all standing units of a given division (`cost = currentCount * refitDeltaCost`).
 *
 * @param {object} params
 * @returns {{
 *   allowed: boolean,
 *   targetTier: number,
 *   unitCount: number,
 *   cost: Record<string, number>,
 *   missingTechs: string[],
 *   canAfford: boolean,
 *   reason: string | null,
 * }} Refit eligibility & cost payload.
 */
export function getUnitRefitRule({
  unitId,
  currentCount = 0,
  currentUnitTier = 2,
  unlockedTechs = [],
  inventory = {},
}) {
  const def = UNITS[unitId];
  if (!def || !def.upgradeTechs?.length) {
    return {
      allowed: false,
      targetTier: currentUnitTier,
      unitCount: 0,
      cost: {},
      missingTechs: [],
      canAfford: false,
      reason: 'Unit cannot be refitted.',
    };
  }
  if (currentUnitTier >= 3) {
    return {
      allowed: false,
      targetTier: 3,
      unitCount: Math.max(0, Math.floor(currentCount)),
      cost: {},
      missingTechs: [],
      canAfford: true,
      reason: 'Already Bronze Tier.',
    };
  }

  const unlockedSet = new Set(unlockedTechs ?? []);
  const missingTechs = def.upgradeTechs.filter((t) => !unlockedSet.has(t));
  const cleanCount = Math.max(0, Math.floor(currentCount));
  const cost =
    cleanCount > 0
      ? Object.fromEntries(
          Object.entries(def.refitDeltaCost ?? {}).map(([id, q]) => [id, q * cleanCount]),
        )
      : {};
  const canAfford = Object.entries(cost).every(([id, q]) => (inventory[id] ?? 0) >= q);

  return {
    allowed: missingTechs.length === 0 && cleanCount > 0 && canAfford,
    targetTier: 3,
    unitCount: cleanCount,
    cost,
    missingTechs,
    canAfford,
    reason:
      missingTechs.length > 0
        ? `Requires: ${missingTechs.join(', ')}`
        : cleanCount === 0
          ? 'No units to refit.'
          : !canAfford
            ? 'Insufficient resources for refit.'
            : null,
  };
}

/**
 * Plans a Sandbox Inter-Territory Caravan Market trade between two Continent coordinates:
 * `[Departure] -> [Travel] -> [Arrive: Buyer gets offer] -> [Return] -> [Arrival: Seller gets payment]`.
 *
 * @param {object} params
 * @returns {{
 *   distanceTiles: number,
 *   distanceKm: number,
 *   caravansNeeded: number,
 *   oneWayTravelMs: number,
 *   arrivesAtMs: number,
 *   returnsAtMs: number,
 * }} Caravan dispatch timing and logistics plan.
 */
export function calculateMarketTradePlan({
  from,
  to,
  offerId,
  offerQty = 1,
  nowMs = 0,
  efficiencyPenalty = 0,
}) {
  const distanceTiles = Math.hypot((to?.x ?? 0) - (from?.x ?? 0), (to?.y ?? 0) - (from?.y ?? 0));
  const distanceKm = Math.max(0.5, distanceTiles * CONTINENT_TILE_DISTANCE_KM);
  const effMult = Math.max(0.2, 1 - efficiencyPenalty);
  const caravanSpeed = UNITS.caravan?.speedKmPerHour ?? 4;
  const oneWayHours = distanceKm / (caravanSpeed * effMult);
  const oneWayTravelMs = Math.max(1000, Math.round(oneWayHours * REAL_MS_PER_INGAME_HOUR));

  const unitBulk = RESOURCES[offerId]?.sizeClass ?? 2;
  const caravanCap = UNITS.caravan?.carryCapacity ?? 150;
  const caravansNeeded = Math.max(1, Math.ceil((Math.max(1, offerQty) * unitBulk) / caravanCap));

  const arrivesAtMs = nowMs + oneWayTravelMs;
  return {
    distanceTiles,
    distanceKm,
    caravansNeeded,
    oneWayTravelMs,
    arrivesAtMs,
    returnsAtMs: arrivesAtMs + oneWayTravelMs,
  };
}

/**
 * Groups building crafting recipes sharing the same `primaryOutputId` so UI modals render
 * a single `Craft` button per product, auto-picking an affordable variant (favoring Ore over Nuggets).
 *
 * @param {object} params
 * @returns {Array<{
 *   primaryOutputId: string,
 *   outputName: string,
 *   recipes: Array<object>,
 *   activeRecipe: object,
 *   hasAnyCraftable: boolean,
 * }>} Grouped output rows.
 */
export function groupBuildingRecipesByOutput({
  recipeIds = [],
  unlockedTechs = [],
  inventory = {},
  water = 0,
}) {
  const unlockedSet = new Set(unlockedTechs);
  const groupsMap = new Map();

  const canCraftOne = (recipe) =>
    water >= (recipe.waterCostBowls ?? 0) &&
    Object.entries(recipe.inputs ?? {}).every(([id, q]) => (inventory[id] ?? 0) >= q);

  for (const recipeId of recipeIds ?? []) {
    const recipe = RECIPES[recipeId];
    if (!recipe) continue;
    if (recipe.requiredTech && !unlockedSet.has(recipe.requiredTech)) continue;

    const outId = recipe.primaryOutputId ?? Object.keys(recipe.outputs ?? {})[0];
    if (!groupsMap.has(outId)) {
      groupsMap.set(outId, []);
    }
    groupsMap.get(outId).push(recipe);
  }

  return Array.from(groupsMap.entries()).map(([primaryOutputId, recipes]) => {
    const craftable = recipes.filter(canCraftOne);
    // When multiple variants are craftable (e.g., Ore vs Nuggets), prefer more efficient later-age/ore variant.
    const preferredCraftable =
      craftable.find((r) => Object.keys(r.inputs).some((id) => id.endsWith('_ore'))) ?? craftable[0];

    const activeRecipe = preferredCraftable ?? recipes[0];
    return {
      primaryOutputId,
      outputName: RESOURCES[primaryOutputId]?.name ?? activeRecipe.name,
      recipes,
      activeRecipe,
      hasAnyCraftable: craftable.length > 0,
    };
  });
}
