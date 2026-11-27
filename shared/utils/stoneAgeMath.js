/**
 * Pure deterministic Stone Age game math, timers, daily survival, yields, and fog rules.
 *
 * Isomorphic & environment-agnostic: never uses Node/DOM APIs or Math.random().
 * All probabilistic helpers accept an explicit seeded `rng()` callback.
 */

import { BUILDINGS } from '../config/buildings.js';
import { PANNABLE_ORE_IDS, RESOURCES } from '../config/resources.js';
import { AGES, STARTER_UNLOCKED_TECHS, TECHNOLOGIES } from '../config/technologies.js';
import { UNITS } from '../config/units.js';
import {
  DAYS_PER_MONTH,
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  EXPLORE_REVEAL_RADIUS,
  HOURS_PER_INGAME_DAY,
  INITIAL_TERRITORY_EXPLORE_SIZE,
  MAX_TEMP_CELSIUS,
  MIN_TEMP_CELSIUS,
  MONTHS_PER_SEASON,
  REAL_MS_PER_INGAME_HOUR,
  SEASONS_PER_YEAR,
  SEASON_NAMES,
  TERRITORY_TILE_DISTANCE_KM,
  WATER_BOWLS_PER_JAR,
} from '../config/worldConstants.js';
import { ORES } from '../config/worldGeology.js';
import { createPrng, hashSeed } from '../generators/prng.js';
import { TERRITORY_FOREST_THRESHOLD } from '../generators/territoryGenerator.js';

/** Seasonal temperature shifts in °C relative to tile baseline climate. */
export const SEASON_TEMP_OFFSET_C = Object.freeze({
  spring: 0,
  summer: 6,
  autumn: -1,
  winter: -8,
});

/**
 * Converts normalized [0, 1] climate temperature into degrees Celsius (`-20°C..+40°C`).
 *
 * @param {number} normalizedTemp - Normalized climate value in [0, 1].
 * @returns {number} Rounded temperature in degrees Celsius.
 */
export function normalizedTempToCelsius(normalizedTemp) {
  const clamped = Math.max(0, Math.min(1, Number(normalizedTemp) || 0));
  return Math.round(
    MIN_TEMP_CELSIUS + clamped * (MAX_TEMP_CELSIUS - MIN_TEMP_CELSIUS),
  );
}

/**
 * Computes ambient Celsius temperature combining tile base climate with season and day/night.
 *
 * @param {number} baseNormalizedTemp - Normalized tile temperature in [0, 1].
 * @param {{ season?: string, isDaylight?: boolean }} [calendar={}] - Active calendar state.
 * @returns {number} Ambient temperature in degrees Celsius.
 */
export function getAmbientTemperatureCelsius(baseNormalizedTemp, calendar = {}) {
  const baseC = normalizedTempToCelsius(baseNormalizedTemp);
  const seasonOffset = SEASON_TEMP_OFFSET_C[calendar.season] ?? 0;
  const diurnalOffset =
    calendar.isDaylight === undefined ? 0 : calendar.isDaylight ? 2 : -2;
  return baseC + seasonOffset + diurnalOffset;
}

/** Base river-panning weights by ore rarity tier (`common` > `uncommon` > `rare` > `very_rare`). */
export const ORE_RARITY_PANNING_WEIGHTS = Object.freeze({
  common: 40,
  uncommon: 16,
  rare: 6,
  very_rare: 2,
});

/** Weight multiplier applied when panning water tiles inside a rockType that hosts the ore. */
export const LOCAL_ROCK_ORE_MULTIPLIER = 2;

/**
 * Probabilistic gather and hunt tables keyed by unit -> biome category.
 * Weights sum cleanly so a non-zero roll can occasionally yield nothing (`itemId: null`).
 */
export const TILE_ACTION_TABLES = Object.freeze({
  gather: Object.freeze({
    fields: Object.freeze([
      { itemId: 'small_stones', min: 1, max: 2, weight: 28 },
      { itemId: 'roots', min: 1, max: 2, weight: 26 },
      { itemId: 'straw', min: 1, max: 2, weight: 28 },
      { itemId: null, min: 0, max: 0, weight: 18 },
    ]),
    forest: Object.freeze([
      { itemId: 'sticks', min: 1, max: 3, weight: 40 },
      { itemId: 'berries', min: 1, max: 3, weight: 32 },
      { itemId: 'sapling', min: 1, max: 1, weight: 10 },
      { itemId: null, min: 0, max: 0, weight: 18 },
    ]),
    water: Object.freeze([
      { itemId: 'clay', min: 1, max: 2, weight: 42 },
      { itemId: 'ore_nugget', min: 1, max: 1, weight: 42 },
      { itemId: null, min: 0, max: 0, weight: 16 },
    ]),
  }),
  hunt: Object.freeze({
    fields: Object.freeze([
      { itemId: 'grain', min: 1, max: 2, weight: 75 },
      { itemId: null, min: 0, max: 0, weight: 25 },
    ]),
    forest: Object.freeze([
      { itemId: 'meat', min: 1, max: 2, weight: 40 },
      { itemId: 'pelts', min: 1, max: 2, weight: 26 },
      { itemId: 'bones', min: 1, max: 2, weight: 14 },
      { itemId: null, min: 0, max: 0, weight: 20 },
    ]),
    water: Object.freeze([
      { itemId: 'fish', min: 1, max: 2, weight: 78 },
      { itemId: null, min: 0, max: 0, weight: 22 },
    ]),
  }),
});

/**
 * Computes the in-game calendar date and continuous day/night phase from elapsed real ms.
 * Time runs at TIME_SCALE (6x): 1 in-game day = 4 real hours; 28 days/month; 3 months/season; 4 seasons/year.
 *
 * @param {number} elapsedRealMs - Real-time milliseconds elapsed since world epoch (>= 0).
 * @returns {{
 *   year: number,
 *   season: string,
 *   seasonIndex: number,
 *   monthOfSeason: number,
 *   dayOfMonth: number,
 *   dayNumber: number,
 *   hourOfDay: number,
 *   isDaylight: boolean,
 *   daylightPhase: 'dawn' | 'day' | 'dusk' | 'night',
 * }} Calendar and continuous day/night state.
 * @throws {RangeError} When elapsedRealMs is negative or non-finite.
 */
export function getCalendarState(elapsedRealMs) {
  if (!Number.isFinite(elapsedRealMs) || elapsedRealMs < 0) {
    throw new RangeError(`elapsedRealMs must be a finite number >= 0, got ${elapsedRealMs}.`);
  }

  const totalIngameHours = elapsedRealMs / REAL_MS_PER_INGAME_HOUR;
  const totalDays = Math.floor(totalIngameHours / HOURS_PER_INGAME_DAY);
  const hourOfDay = totalIngameHours % HOURS_PER_INGAME_DAY;

  const isDaylight = hourOfDay >= 6 && hourOfDay < 18;
  const daylightPhase =
    hourOfDay >= 5 && hourOfDay < 7
      ? 'dawn'
      : hourOfDay >= 7 && hourOfDay < 17
        ? 'day'
        : hourOfDay >= 17 && hourOfDay < 19
          ? 'dusk'
          : 'night';

  const dayOfMonth = (totalDays % DAYS_PER_MONTH) + 1;
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  const monthOfSeason = (totalMonths % MONTHS_PER_SEASON) + 1;
  const totalSeasons = Math.floor(totalMonths / MONTHS_PER_SEASON);
  const seasonIndex = totalSeasons % SEASONS_PER_YEAR;
  const season = SEASON_NAMES[seasonIndex];
  const year = Math.floor(totalSeasons / SEASONS_PER_YEAR) + 1;

  return {
    year,
    season,
    seasonIndex,
    monthOfSeason,
    dayOfMonth,
    dayNumber: totalDays + 1,
    hourOfDay,
    isDaylight,
    daylightPhase,
  };
}

/**
 * Calculates total storage capacity consumed using each item's linear sizeClass (1..5).
 *
 * @param {Record<string, number> | Map<string, number>} inventory - Item counts by resourceId.
 * @returns {number} Sum of `quantity * sizeClass`.
 * @throws {Error} When an item ID is unknown or quantity is negative.
 */
export function calculateStorageUsed(inventory) {
  const entries = inventory instanceof Map ? inventory.entries() : Object.entries(inventory ?? {});
  let total = 0;

  for (const [resourceId, quantity] of entries) {
    if (quantity === 0) continue;
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new RangeError(`Invalid inventory quantity for "${resourceId}": ${quantity}.`);
    }
    const resource = RESOURCES[resourceId];
    if (!resource) {
      throw new Error(`Unknown resourceId "${resourceId}" in inventory.`);
    }
    total += quantity * resource.sizeClass;
  }

  return total;
}

/**
 * Computes fractional tier-and-level scaling strictly bounded below the next tier's base value:
 * `round(B_T + (B_{T+1} - B_T) * ((level - 1) / maxLevel))`.
 * Because `(level - 1) / maxLevel < 1`, maxLevel in Tier T can never exceed `B_{T+1}`.
 *
 * @param {Record<number, number> | null | undefined} tierBases - Base stat values keyed by integer tier.
 * @param {number} [tier=1] - Current building tier.
 * @param {number} [level=1] - Current building level within the tier.
 * @param {number} [maxLevel=3] - Maximum level permitted within the tier.
 * @returns {number} Scaled integer attribute value.
 */
export function calculateTierLevelValue(tierBases, tier = 1, level = 1, maxLevel = 3) {
  if (!tierBases) return 0;
  const safeMaxLevel = Math.max(1, maxLevel);
  const clampedLevel = Math.max(1, Math.min(level, safeMaxLevel));
  const sortedTiers = Object.keys(tierBases)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const fallbackTier = sortedTiers[0] ?? 1;
  const curBase = tierBases[tier] ?? tierBases[fallbackTier] ?? 0;
  if (curBase <= 0) return 0;

  const nextBase = tierBases[tier + 1] ?? curBase * 3;
  return Math.round(curBase + (nextBase - curBase) * ((clampedLevel - 1) / safeMaxLevel));
}

/**
 * Calculates pooled village storage capacity across all active buildings plus portable containers
 * (`woven_basket`: +15 general bulk each; `clay_vessel`: +20 preserved food capacity each at 0.7x spoil).
 * Excludes specialized Farmstead seed vaults (`calculateFarmSeedCapacity`) and separates
 * general capacity (Main + Warehouses + Baskets) from preserved food capacity (Granaries + Vessels).
 *
 * @param {Array<{ buildingId: string, tier?: number, level?: number, status?: string }>} buildings - Placed buildings.
 * @param {Record<string, number> | Map<string, number>} [inventory={}] - Optional item map for container bonuses.
 * @returns {{
 *   generalCapacity: number,
 *   preservedFoodCapacity: number,
 *   totalCapacity: number,
 *   preservedSpoilageMultiplier: number,
 * }} Pooled storage capacities and preservation modifier.
 */
export function calculateStorageCapacity(buildings, inventory = {}) {
  let generalCapacity = 0;
  let preservedFoodCapacity = 0;
  let bestSpoilageMultiplier = 1;

  for (const instance of buildings ?? []) {
    if (instance.status && instance.status !== 'active') continue;
    const def = BUILDINGS[instance.buildingId];
    if (!def || def.id === 'farm') continue;
    const tier = instance.tier ?? def.tier;
    const level = Math.max(1, Math.min(instance.level ?? 1, def.maxLevel));

    if (def.storageTierBases) {
      generalCapacity += calculateTierLevelValue(def.storageTierBases, tier, level, def.maxLevel);
    } else if (def.storageBonusPerLevel > 0) {
      generalCapacity += def.storageBonusPerLevel * level;
    }

    if (def.preservedStorageTierBases) {
      preservedFoodCapacity += calculateTierLevelValue(
        def.preservedStorageTierBases,
        tier,
        level,
        def.maxLevel,
      );
      if (def.spoilageMultiplier < bestSpoilageMultiplier) {
        bestSpoilageMultiplier = def.spoilageMultiplier;
      }
    } else if (def.preservedStorageBonusPerLevel > 0) {
      preservedFoodCapacity += def.preservedStorageBonusPerLevel * level;
      if (def.spoilageMultiplier < bestSpoilageMultiplier) {
        bestSpoilageMultiplier = def.spoilageMultiplier;
      }
    }
  }

  const getQty = (id) =>
    inventory instanceof Map ? (inventory.get(id) ?? 0) : (inventory?.[id] ?? 0);
  const basketQty = Math.max(0, Math.floor(getQty('woven_basket')));
  const vesselQty = Math.max(0, Math.floor(getQty('clay_vessel')));
  generalCapacity += basketQty * 15;
  if (vesselQty > 0) {
    preservedFoodCapacity += vesselQty * 20;
    bestSpoilageMultiplier = Math.min(bestSpoilageMultiplier, 0.7);
  }

  return {
    generalCapacity,
    preservedFoodCapacity,
    totalCapacity: generalCapacity + preservedFoodCapacity,
    preservedSpoilageMultiplier: bestSpoilageMultiplier,
  };
}

/**
 * Calculates total available food nutrition across edible items in storage plus fractional carry.
 *
 * @param {Record<string, number> | Map<string, number>} inventory - Item counts by resourceId.
 * @param {number} [foodCarry=0] - Leftover food fraction from multi-ration meals.
 * @returns {number} Total edible food rations available.
 */
export function calculateTotalStoredFood(inventory, foodCarry = 0) {
  const entries = inventory instanceof Map ? inventory.entries() : Object.entries(inventory ?? {});
  let total = Math.max(0, Number(foodCarry) || 0);

  for (const [resourceId, quantity] of entries) {
    if (!quantity || quantity <= 0) continue;
    const def = RESOURCES[resourceId];
    if (def?.edible && def.foodValue > 0) {
      total += quantity * def.foodValue;
    }
  }

  return Math.round(total * 1000) / 1000;
}

/**
 * Automatically feeds `foodNeeded` units from stored edible items using FEFO order
 * (highest `spoilRatePerDay` eaten first; ties break toward lower `foodValue`).
 * Multi-ration items (e.g., Cooked Meat = 3) retain leftover nutrition in `foodCarry`.
 *
 * @param {object} params
 * @param {Record<string, number>} [params.inventory={}] - Source inventory map.
 * @param {number} [params.foodCarry=0] - Existing fractional ration carry.
 * @param {number} [params.foodNeeded=0] - Total daily food rations required.
 * @returns {{
 *   inventory: Record<string, number>,
 *   foodCarry: number,
 *   consumed: Record<string, number>,
 *   foodDeficit: number,
 *   isStarving: boolean,
 * }} Updated inventory, leftover carry, consumed counts, and deficit status.
 */
export function consumeStoredFoodFEFO({ inventory = {}, foodCarry = 0, foodNeeded = 0 } = {}) {
  if (foodNeeded < 0 || foodCarry < 0) {
    throw new RangeError('foodNeeded and foodCarry must be non-negative.');
  }

  const nextInventory = { ...inventory };
  let carry = Number(foodCarry) || 0;
  let needed = Number(foodNeeded) || 0;
  const consumed = {};

  if (carry > 0 && needed > 0) {
    const fromCarry = Math.min(carry, needed);
    carry -= fromCarry;
    needed -= fromCarry;
  }

  if (needed > 1e-9) {
    const edibleItems = Object.entries(nextInventory)
      .filter(([id, qty]) => qty > 0 && RESOURCES[id]?.edible && RESOURCES[id].foodValue > 0)
      .map(([id]) => RESOURCES[id])
      .sort(
        (a, b) =>
          b.spoilRatePerDay - a.spoilRatePerDay ||
          a.foodValue - b.foodValue ||
          a.id.localeCompare(b.id),
      );

    for (const item of edibleItems) {
      if (needed <= 1e-9) break;
      const availQty = nextInventory[item.id] ?? 0;
      const unitsToConsume = Math.min(availQty, Math.ceil(needed / item.foodValue));
      if (unitsToConsume <= 0) continue;

      const remaining = availQty - unitsToConsume;
      if (remaining <= 0) {
        delete nextInventory[item.id];
      } else {
        nextInventory[item.id] = remaining;
      }
      consumed[item.id] = (consumed[item.id] ?? 0) + unitsToConsume;

      const gained = unitsToConsume * item.foodValue;
      if (gained >= needed) {
        carry += gained - needed;
        needed = 0;
      } else {
        needed -= gained;
      }
    }
  }

  const normalizedCarry = carry <= 1e-9 ? 0 : Math.round(carry * 1000) / 1000;
  const foodDeficit = needed <= 1e-9 ? 0 : Math.round(needed * 1000) / 1000;

  return {
    inventory: nextInventory,
    foodCarry: normalizedCarry,
    consumed,
    foodDeficit,
    isStarving: foodDeficit > 0,
  };
}

/**
 * Applies fractional per-type daily food spoilage (`S1`), carrying partial losses across
 * days in `spoilageCarry` so small stacks do not vanish prematurely yet still converge cleanly.
 * Preserved storage slots (e.g., future Granaries) protect highest-spoil food stacks first.
 *
 * @param {object} params
 * @param {Record<string, number>} [params.inventory={}] - Source inventory counts.
 * @param {Record<string, number>} [params.spoilageCarry={}] - Fractional spoilage accumulators per resourceId.
 * @param {number} [params.elapsedDays=1] - Whole in-game days elapsed.
 * @param {Array<{ buildingId: string, level?: number, status?: string }>} [params.buildings=[]] - Placed buildings.
 * @returns {{
 *   inventory: Record<string, number>,
 *   spoilageCarry: Record<string, number>,
 *   spoiled: Record<string, number>,
 * }} Post-spoilage inventory, updated carry map, and removed item counts.
 */
export function applyDailySpoilage({
  inventory = {},
  spoilageCarry = {},
  elapsedDays = 1,
  buildings = [],
} = {}) {
  if (!Number.isFinite(elapsedDays) || elapsedDays < 0) {
    throw new RangeError('elapsedDays must be non-negative.');
  }

  const wholeDays = Math.floor(elapsedDays);
  const nextInventory = { ...inventory };
  const nextCarry = { ...spoilageCarry };
  const spoiled = {};
  if (wholeDays === 0) {
    return { inventory: nextInventory, spoilageCarry: nextCarry, spoiled };
  }

  const { preservedFoodCapacity, preservedSpoilageMultiplier } = calculateStorageCapacity(
    buildings,
    inventory,
  );

  for (let day = 0; day < wholeDays; day += 1) {
    let remainingPreservedBulk = preservedFoodCapacity;
    const perishableItems = Object.entries(nextInventory)
      .filter(([id, qty]) => qty > 0 && (RESOURCES[id]?.spoilRatePerDay ?? 0) > 0)
      .map(([id]) => RESOURCES[id])
      .sort((a, b) => b.spoilRatePerDay - a.spoilRatePerDay || a.id.localeCompare(b.id));

    for (const def of perishableItems) {
      const qty = nextInventory[def.id] ?? 0;
      if (qty <= 0) continue;

      // Fastest-spoiling items receive Granary/preserved capacity protection first.
      const protectedCount =
        remainingPreservedBulk > 0
          ? Math.min(qty, Math.floor(remainingPreservedBulk / def.sizeClass))
          : 0;
      remainingPreservedBulk = Math.max(0, remainingPreservedBulk - protectedCount * def.sizeClass);
      const unprotectedCount = qty - protectedCount;

      const rawDailyLoss =
        protectedCount * def.spoilRatePerDay * preservedSpoilageMultiplier +
        unprotectedCount * def.spoilRatePerDay;
      const accumulated = (nextCarry[def.id] ?? 0) + rawDailyLoss;
      const lost = Math.min(qty, Math.floor(accumulated + 1e-9));

      if (lost > 0) {
        const remaining = qty - lost;
        spoiled[def.id] = (spoiled[def.id] ?? 0) + lost;
        if (remaining <= 0) {
          delete nextInventory[def.id];
          delete nextCarry[def.id];
          continue;
        }
        nextInventory[def.id] = remaining;
      }

      const leftoverCarry = Math.round((accumulated - lost) * 10000) / 10000;
      if (leftoverCarry > 1e-9) {
        nextCarry[def.id] = leftoverCarry;
      } else {
        delete nextCarry[def.id];
      }
    }
  }

  return { inventory: nextInventory, spoilageCarry: nextCarry, spoiled };
}

/** 5-stage starvation & dehydration debuff progression table (Day 1..5+). */
export const STARVATION_DEBUFF_STAGES = Object.freeze([
  Object.freeze({ minDays: 0, id: 'healthy', label: 'Healthy', efficiencyPenalty: 0, popLossRatePerDay: 0 }),
  Object.freeze({ minDays: 1, id: 'hunger_1', label: 'Hunger I', efficiencyPenalty: 0.1, popLossRatePerDay: 0 }),
  Object.freeze({ minDays: 2, id: 'hunger_2', label: 'Hunger II', efficiencyPenalty: 0.3, popLossRatePerDay: 0 }),
  Object.freeze({ minDays: 3, id: 'hunger_3', label: 'Hunger III', efficiencyPenalty: 0.5, popLossRatePerDay: 0 }),
  Object.freeze({ minDays: 4, id: 'sickness', label: 'Sickness', efficiencyPenalty: 0.8, popLossRatePerDay: 0 }),
  Object.freeze({ minDays: 5, id: 'death', label: 'Death', efficiencyPenalty: 0.8, popLossRatePerDay: 0.1 }),
]);

/**
 * Classifies current starvation/dehydration debuff metadata for HUD badges and tooltips.
 *
 * @param {object} [params={}]
 * @param {number} [params.starvationDays=0]
 * @param {number} [params.efficiencyPenalty=0]
 * @param {number} [params.starvationPopLoss=0]
 * @param {boolean} [params.isAbandoned=false]
 * @returns {{ id: string, label: string, efficiencyPenalty: number, severity: string }}
 */
export function getStarvationStageInfo({
  starvationDays = 0,
  efficiencyPenalty = 0,
  starvationPopLoss = 0,
  isAbandoned = false,
} = {}) {
  if (isAbandoned) {
    return { id: 'abandoned', label: 'Abandoned', efficiencyPenalty: 0.8, severity: 'abandoned' };
  }
  if (starvationDays <= 0 && efficiencyPenalty <= 0 && starvationPopLoss <= 0) {
    return { id: 'healthy', label: 'Healthy', efficiencyPenalty: 0, severity: 'ok' };
  }
  if (starvationDays >= 5) {
    return { id: 'death', label: 'Death', efficiencyPenalty, severity: 'critical' };
  }
  if (efficiencyPenalty >= 0.79) {
    return { id: 'sickness', label: 'Sickness', efficiencyPenalty, severity: 'danger' };
  }
  if (efficiencyPenalty >= 0.49) {
    return { id: 'hunger_3', label: 'Hunger III', efficiencyPenalty, severity: 'warning' };
  }
  if (efficiencyPenalty >= 0.29) {
    return { id: 'hunger_2', label: 'Hunger II', efficiencyPenalty, severity: 'warning' };
  }
  if (efficiencyPenalty > 0) {
    return { id: 'hunger_1', label: 'Hunger I', efficiencyPenalty, severity: 'caution' };
  }
  return { id: 'recovering', label: 'Recovering', efficiencyPenalty: 0, severity: 'caution' };
}

/**
 * Advances daily starvation/dehydration debuffs on deficit days or recovers efficiency (+20%/day)
 * and max population (+10%/day) when fed & hydrated.
 *
 * @param {object} params
 * @param {number} [params.starvationDays=0] - Prior consecutive/adjusted deficit day counter.
 * @param {number} [params.efficiencyPenalty=0] - Current penalty fraction (0..0.8).
 * @param {number} [params.starvationPopLoss=0] - Cumulative max population slots lost to Death days.
 * @param {boolean} [params.isAbandoned=false] - Whether village has already collapsed.
 * @param {boolean} [params.hasDeficit=false] - True when food OR water fell short on the day.
 * @param {number} [params.buildingMaxPop=10] - Structural max pop capacity from active Main + Houses.
 * @param {number} [params.elapsedDays=1] - Whole in-game days to simulate.
 * @returns {{
 *   starvationDays: number,
 *   efficiencyPenalty: number,
 *   starvationPopLoss: number,
 *   effectiveMaxPop: number,
 *   isAbandoned: boolean,
 *   stage: { id: string, label: string, efficiencyPenalty: number, severity: string },
 * }} Updated affliction and effective population cap state.
 */
export function advanceStarvationState({
  starvationDays = 0,
  efficiencyPenalty = 0,
  starvationPopLoss = 0,
  isAbandoned = false,
  hasDeficit = false,
  buildingMaxPop = 10,
  elapsedDays = 1,
} = {}) {
  if (isAbandoned) {
    return {
      starvationDays,
      efficiencyPenalty: 0.8,
      starvationPopLoss: Math.max(starvationPopLoss, buildingMaxPop),
      effectiveMaxPop: 0,
      isAbandoned: true,
      stage: getStarvationStageInfo({
        starvationDays,
        efficiencyPenalty: 0.8,
        starvationPopLoss,
        isAbandoned: true,
      }),
    };
  }

  let days = starvationDays;
  let penalty = efficiencyPenalty;
  let popLoss = starvationPopLoss;
  let abandoned = false;
  const popStep = buildingMaxPop > 0 ? Math.max(1, Math.round(buildingMaxPop * 0.1)) : 0;

  for (let i = 0; i < Math.max(0, Math.floor(elapsedDays)); i += 1) {
    if (hasDeficit) {
      days += 1;
      const stagePenalty = STARVATION_DEBUFF_STAGES[Math.min(days, 5)].efficiencyPenalty;
      penalty = Math.max(penalty, stagePenalty);

      if (days >= 5 && popStep > 0) {
        popLoss = Math.min(buildingMaxPop, popLoss + popStep);
        if (buildingMaxPop - popLoss <= 0) {
          abandoned = true;
          break;
        }
      }
    } else if (penalty > 0 || popLoss > 0 || days > 0) {
      penalty = Math.max(0, Math.round((penalty - 0.2) * 100) / 100);
      popLoss = Math.max(0, popLoss - popStep);
      days = penalty === 0 && popLoss === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(penalty * 5)));
    }
  }

  const effectiveMaxPop = abandoned ? 0 : Math.max(0, buildingMaxPop - popLoss);
  const nextAbandoned = abandoned || (days >= 5 && effectiveMaxPop <= 0);

  return {
    starvationDays: days,
    efficiencyPenalty: nextAbandoned ? 0.8 : penalty,
    starvationPopLoss: popLoss,
    effectiveMaxPop,
    isAbandoned: nextAbandoned,
    stage: getStarvationStageInfo({
      starvationDays: days,
      efficiencyPenalty: nextAbandoned ? 0.8 : penalty,
      starvationPopLoss: popLoss,
      isAbandoned: nextAbandoned,
    }),
  };
}

/**
 * Calculates total village water bowl storage across all active buildings and crafted Clay Vessels
 * (Main provides 10 / 25 / 50 bowls across Lv 1 / 2 / 3 via `waterCapacityByLevel`; each `clay_vessel` adds +10).
 *
 * @param {Array<{ buildingId: string, level?: number, status?: string }>} buildings - Placed buildings.
 * @param {Record<string, number> | Map<string, number>} [inventory={}] - Optional inventory map for Clay Vessel bonuses.
 * @returns {number} Total water bowl storage capacity.
 */
export function calculateWaterCapacity(buildings, inventory = {}) {
  let total = 0;

  for (const instance of buildings ?? []) {
    // Buildings under construction do not expand village water reserves yet.
    if (instance.status && instance.status !== 'active') continue;
    const def = BUILDINGS[instance.buildingId];
    if (!def) continue;
    const tier = instance.tier ?? def.tier;
    const level = Math.max(1, Math.min(instance.level ?? 1, def.maxLevel));

    if (tier === 1 && Array.isArray(def.waterCapacityByLevel) && def.waterCapacityByLevel.length > 0) {
      const idx = Math.min(level - 1, def.waterCapacityByLevel.length - 1);
      total += def.waterCapacityByLevel[idx];
    } else if (def.waterTierBases) {
      total += calculateTierLevelValue(def.waterTierBases, tier, level, def.maxLevel);
    } else if (def.waterCapacity > 0) {
      total += def.waterCapacity * level;
    }
  }

  const vesselQty =
    inventory instanceof Map ? (inventory.get('clay_vessel') ?? 0) : (inventory?.clay_vessel ?? 0);
  total += Math.max(0, Math.floor(vesselQty)) * 10;

  return total;
}

/**
 * Resolves unit training resource cost dynamically (`gatherer`/`builder` remain free to avoid
 * soft-locks; `hunter` adds `1 Small Stone` once `stone_tools` is unlocked).
 *
 * @param {string} unitId
 * @param {string[] | Set<string>} [unlockedTechs=[]]
 * @returns {Record<string, number>} Resource requirements keyed by resourceId.
 */
export function getUnitTrainingCost(unitId, unlockedTechs = []) {
  const def = UNITS[unitId];
  if (!def) return {};
  if (unitId === 'hunter') {
    const unlocked = unlockedTechs instanceof Set ? unlockedTechs : new Set(unlockedTechs);
    return unlocked.has('stone_tools')
      ? { sticks: 1, small_stones: 1 }
      : { sticks: 1 };
  }
  return def.trainingCost ?? {};
}

/**
 * Distributes famine population losses equally by removing whole units starting from
 * the role carrying the highest current population (`count * popCost`, tie-breaking
 * `gatherer` -> `hunter` -> `builder`). Never removes fractional ("half") units.
 *
 * @param {Record<string, number>} [units={}] - Current unit counts keyed by unitId.
 * @param {number} [excessPopToTrim=0] - Population slots above `effectiveMaxPop` to trim.
 * @param {Record<string, number>} [unitPopCosts={}] - Optional popCost overrides keyed by unitId.
 * @returns {{
 *   units: Record<string, number>,
 *   trimmedTotal: number,
 *   trimmedByUnit: Record<string, number>,
 * }} Post-trim unit counts and casualty summary.
 */
export function trimUnitsBalanced(units = {}, excessPopToTrim = 0, unitPopCosts = {}) {
  const nextUnits = { ...units };
  const trimmedByUnit = {};
  let trimmedTotal = 0;
  let remaining = Math.max(0, Math.floor(excessPopToTrim));

  const baseOrder = ['gatherer', 'hunter', 'builder'];
  const extraIds = Object.keys(nextUnits).filter((id) => !baseOrder.includes(id));
  const candidateOrder = [...baseOrder, ...extraIds];

  while (remaining > 0) {
    const activeIds = candidateOrder.filter((unitId) => (nextUnits[unitId] ?? 0) > 0);
    if (activeIds.length === 0) break;

    const getPopCost = (unitId) => unitPopCosts?.[unitId] ?? UNITS[unitId]?.popCost ?? 1;

    // Prefer whole units whose popCost fits within remaining excess; fall back to any active role so partial units never occur.
    const fittingIds = activeIds.filter((unitId) => getPopCost(unitId) <= remaining);
    const pool = fittingIds.length > 0 ? fittingIds : activeIds;

    let picked = pool[0];
    let highestPop = (nextUnits[picked] ?? 0) * getPopCost(picked);

    for (let i = 1; i < pool.length; i += 1) {
      const unitId = pool[i];
      const rolePop = (nextUnits[unitId] ?? 0) * getPopCost(unitId);
      if (rolePop > highestPop) {
        highestPop = rolePop;
        picked = unitId;
      }
    }

    nextUnits[picked] -= 1;
    trimmedByUnit[picked] = (trimmedByUnit[picked] ?? 0) + 1;
    trimmedTotal += 1;
    remaining = Math.max(0, remaining - getPopCost(picked));
  }

  return { units: nextUnits, trimmedTotal, trimmedByUnit };
}

/**
 * Calculates total maximum village population from active Main + House buildings.
 *
 * @param {Array<{ buildingId: string, level?: number, status?: string }>} buildings - Placed buildings.
 * @returns {number} Maximum available population slots.
 */
export function calculateMaxPopulation(buildings) {
  let maxPop = 0;

  for (const instance of buildings ?? []) {
    // Unfinished buildings under construction do not grant housing capacity yet.
    if (instance.status && instance.status !== 'active') continue;
    const def = BUILDINGS[instance.buildingId];
    if (!def) continue;
    const tier = instance.tier ?? def.tier;
    const level = Math.max(1, Math.min(instance.level ?? 1, def.maxLevel));

    if (def.popTierBases) {
      maxPop += calculateTierLevelValue(def.popTierBases, tier, level, def.maxLevel);
    } else if (def.popBonusPerLevel > 0) {
      maxPop += def.popBonusPerLevel * level;
    }
  }

  return maxPop;
}

/**
 * Calculates active used population across trained units and building workers.
 * Daily survival scales with `popUsed`, not unused `popCapacity`.
 *
 * @param {object} params - Village population inputs.
 * @param {Record<string, number>} [params.units={}] - Unit counts keyed by unitId.
 * @param {Array<{ buildingId: string, status?: string }>} [params.buildings=[]] - Village buildings.
 * @returns {number} Total `popUsed`.
 */
export function calculatePopUsed({ units = {}, buildings = [] } = {}) {
  let total = 0;

  for (const [unitId, count] of Object.entries(units)) {
    if (count <= 0) continue;
    const def = UNITS[unitId];
    if (!def) {
      throw new Error(`Unknown unitId "${unitId}" in unit counts.`);
    }
    total += count * def.popCost;
  }

  for (const instance of buildings) {
    if (instance.status && instance.status !== 'active') continue;
    const def = BUILDINGS[instance.buildingId];
    if (!def) continue;
    total += def.workersRequired;
  }

  return total;
}

/**
 * Lazily evaluates food and water consumption over `elapsedDays` using `popUsed`.
 * At spawn with 0 active units/workers (`popUsed === 0`), daily drain is 0.
 *
 * @param {object} params - Survival calculation inputs.
 * @param {number} params.popUsed - Active used population consuming rations.
 * @param {number} params.food - Available food count.
 * @param {number} params.water - Available water bowls.
 * @param {number} [params.elapsedDays=1] - Elapsed in-game days (whole or fractional).
 * @returns {{
 *   foodNeeded: number,
 *   waterNeeded: number,
 *   foodRemaining: number,
 *   waterRemaining: number,
 *   foodDeficit: number,
 *   waterDeficit: number,
 *   isStarving: boolean,
 *   isDehydrated: boolean,
 * }} Post-consumption sustenance state.
 */
export function calculateDailySurvival({ popUsed, food, water, elapsedDays = 1 }) {
  if (popUsed < 0 || food < 0 || water < 0 || elapsedDays < 0) {
    throw new RangeError('Daily survival inputs must be non-negative.');
  }

  const foodNeeded = popUsed * elapsedDays;
  const waterNeeded = popUsed * elapsedDays;
  const foodRemaining = Math.max(0, food - foodNeeded);
  const waterRemaining = Math.max(0, water - waterNeeded);
  const foodDeficit = Math.max(0, foodNeeded - food);
  const waterDeficit = Math.max(0, waterNeeded - water);

  return {
    foodNeeded,
    waterNeeded,
    foodRemaining,
    waterRemaining,
    foodDeficit,
    waterDeficit,
    isStarving: foodDeficit > 0,
    isDehydrated: waterDeficit > 0,
  };
}

/**
 * Computes physical Euclidean distance in kilometers between two grid coordinates.
 *
 * @param {{ x: number, y: number }} from - Origin tile coordinates.
 * @param {{ x: number, y: number }} to - Target tile coordinates.
 * @param {number} [tileDistanceKm=0.5] - Kilometers per tile (default 500m territory tile).
 * @returns {number} Distance in kilometers.
 */
export function calculateTileDistanceKm(from, to, tileDistanceKm = TERRITORY_TILE_DISTANCE_KM) {
  return Math.hypot(to.x - from.x, to.y - from.y) * tileDistanceKm;
}

/**
 * Computes deterministic round-trip construction timestamps for a building.
 * Builders travel MAIN -> tile, construct for `buildTimeHours`, then stay locked
 * on the return trip tile -> MAIN before becoming available again.
 *
 * @param {object} params - Build timing parameters.
 * @param {{ x: number, y: number }} [params.from={ x: 12, y: 12 }] - Main village tile.
 * @param {{ x: number, y: number }} params.to - Target construction tile.
 * @param {string} params.buildingId - Building template ID.
 * @param {number} [params.nowMs=0] - Real-time epoch timestamp when ordered.
 * @param {number} [params.speedKmPerHour=UNITS.builder.speedKmPerHour] - Builder travel speed.
 * @param {number} [params.efficiencyPenalty=0] - Active village hunger/sickness penalty fraction (0..0.8).
 * @returns {{
 *   distanceKm: number,
 *   oneWayTravelMs: number,
 *   buildMs: number,
 *   arrivesAtMs: number,
 *   completedAtMs: number,
 *   builderAvailableAtMs: number,
 * }} Construction lifecycle timestamps in real milliseconds.
 */
export function calculateBuildTimestamps({
  from = { x: 12, y: 12 },
  to,
  buildingId,
  nowMs = 0,
  speedKmPerHour = UNITS.builder.speedKmPerHour,
  efficiencyPenalty = 0,
}) {
  const def = BUILDINGS[buildingId];
  if (!def) {
    throw new Error(`Unknown buildingId "${buildingId}".`);
  }

  const efficiencyMult = Math.max(0.2, 1 - efficiencyPenalty);
  const distanceKm = calculateTileDistanceKm(from, to);
  const oneWayTravelMs = Math.round(
    (distanceKm / (speedKmPerHour * efficiencyMult)) * REAL_MS_PER_INGAME_HOUR,
  );
  const buildMs = Math.round((def.buildTimeHours / efficiencyMult) * REAL_MS_PER_INGAME_HOUR);
  const arrivesAtMs = nowMs + oneWayTravelMs;
  const completedAtMs = arrivesAtMs + buildMs;

  return {
    distanceKm,
    oneWayTravelMs,
    buildMs,
    arrivesAtMs,
    completedAtMs,
    builderAvailableAtMs: completedAtMs + oneWayTravelMs,
  };
}

/**
 * Selects the highest-tier unlocked tool technology matching `toolType`.
 * Workers always benefit automatically without equipping tool items.
 *
 * @param {string[] | Set<string>} [unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked tech IDs.
 * @param {string} [toolType='general'] - Tool specialization ('general' in Stone Age).
 * @returns {Readonly<object> | null} Highest-tier unlocked tool tech node, or null if none.
 */
export function getBestUnlockedTool(unlockedTechs = STARTER_UNLOCKED_TECHS, toolType = 'general') {
  let best = null;

  for (const techId of unlockedTechs ?? []) {
    const tech = TECHNOLOGIES[techId];
    if (!tech || tech.category !== 'tool' || tech.toolType !== toolType) continue;
    if (!best || tech.tier > best.tier) {
      best = tech;
    }
  }

  return best;
}

/**
 * Checks whether a technology branch's gameplay trigger condition has been satisfied.
 *
 * @param {string} techId - Technology node identifier.
 * @param {object} [progress={}] - Observed player/village progression metrics.
 * @param {Array<{ buildingId: string, status?: string }>} [progress.builtBuildings=[]] - Active/placed buildings.
 * @param {Record<string, number>} [progress.craftedCounts={}] - Lifetime or trigger craft counts by itemId.
 * @returns {boolean} True when the technology's branch trigger condition is met.
 * @throws {Error} When `techId` does not exist in `TECHNOLOGIES`.
 */
export function isTechTriggerSatisfied(
  techId,
  { builtBuildings = [], craftedCounts = {} } = {},
) {
  const tech = TECHNOLOGIES[techId];
  if (!tech) {
    throw new Error(`Unknown techId "${techId}".`);
  }

  const trigger = tech.unlockTrigger;
  if (trigger.type === 'starter') return true;

  if (trigger.type === 'build') {
    const activeMatches = builtBuildings.filter(
      (b) => b.buildingId === trigger.buildingId && (!b.status || b.status === 'active'),
    ).length;
    return activeMatches >= (trigger.count ?? 1);
  }

  if (trigger.type === 'craft') {
    return (craftedCounts[trigger.itemId] ?? 0) >= (trigger.count ?? 1);
  }

  return false;
}

/**
 * Validates whether a building can be constructed or upgraded given Main Tier & unlocked techs.
 * Existing higher-tier buildings remain intact when Main is downgraded, but cannot upgrade
 * further until Main advances back to >= their tier. Newly constructed buildings adopt `mainTier`.
 *
 * @param {object} params - Validation inputs.
 * @param {string} params.buildingId - Target building template ID.
 * @param {number} [params.currentLevel=0] - 0 for new construction, >=1 for existing building.
 * @param {number} [params.targetLevel=1] - Desired post-build/upgrade level.
 * @param {number} [params.buildingTier] - Existing instance tier (defaults to template base tier).
 * @param {number} [params.mainTier=1] - Current Age Tier of the village's Main building.
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked tech IDs.
 * @returns {{ allowed: boolean, reason: string | null, spawnTier: number }} Permission and resulting tier.
 */
export function canBuildOrUpgradeBuilding({
  buildingId,
  currentLevel = 0,
  targetLevel = 1,
  buildingTier,
  mainTier = 1,
  unlockedTechs = STARTER_UNLOCKED_TECHS,
}) {
  const def = BUILDINGS[buildingId];
  if (!def) {
    throw new Error(`Unknown buildingId "${buildingId}".`);
  }

  const unlockedSet = new Set(unlockedTechs ?? []);
  const effectiveTier = currentLevel === 0 ? mainTier : (buildingTier ?? def.tier);

  if (currentLevel === 0) {
    if (!def.buildable) {
      return { allowed: false, reason: 'Building is not constructible.', spawnTier: effectiveTier };
    }
    if (mainTier < def.tier) {
      return { allowed: false, reason: `Requires Main Tier ${def.tier}.`, spawnTier: effectiveTier };
    }
  } else if (mainTier < effectiveTier || mainTier < def.tier) {
    return {
      allowed: false,
      reason: 'Cannot upgrade while Main is downgraded below building tier.',
      spawnTier: effectiveTier,
    };
  }

  const missingTech = def.requiredTechs.find((techId) => !unlockedSet.has(techId));
  if (missingTech) {
    return {
      allowed: false,
      reason: `Requires technology: ${missingTech}.`,
      spawnTier: effectiveTier,
    };
  }

  if (currentLevel === 0) {
    if (targetLevel < 1 || targetLevel > def.maxLevel) {
      return {
        allowed: false,
        reason: `Invalid level ${targetLevel} (max ${def.maxLevel}).`,
        spawnTier: effectiveTier,
      };
    }
  } else if (targetLevel <= currentLevel || targetLevel > def.maxLevel) {
    return {
      allowed: false,
      reason: `Invalid upgrade target level ${targetLevel} from ${currentLevel} (max ${def.maxLevel}).`,
      spawnTier: effectiveTier,
    };
  }

  return { allowed: true, reason: null, spawnTier: effectiveTier };
}

/**
 * Evaluates a village Main Age Tier transition (`downgrade` is free; `upgrade` always costs
 * normal materials and builder time once unlocked by Age trigger tech).
 *
 * @param {object} params - Main tier transition inputs.
 * @param {number} params.currentMainTier - Current village Main Tier (1..5).
 * @param {number} params.targetMainTier - Desired village Main Tier (1..5).
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked tech IDs.
 * @returns {{
 *   allowed: boolean,
 *   direction: 'upgrade' | 'downgrade' | 'none',
 *   isFree: boolean,
 *   cost: Record<string, number>,
 *   buildTimeHours: number,
 *   buildersRequired: number,
 *   targetAge: string | null,
 *   reason: string | null,
 * }} Transition rules and costs.
 * @throws {RangeError} When either tier is outside 1..5.
 */
export function getMainTierChangeRule({
  currentMainTier,
  targetMainTier,
  unlockedTechs = STARTER_UNLOCKED_TECHS,
}) {
  if (
    !Number.isInteger(currentMainTier) ||
    currentMainTier < 1 ||
    currentMainTier > AGES.length ||
    !Number.isInteger(targetMainTier) ||
    targetMainTier < 1 ||
    targetMainTier > AGES.length
  ) {
    throw new RangeError(
      `Main tiers must be integers 1..${AGES.length}, got ${currentMainTier} -> ${targetMainTier}.`,
    );
  }

  if (targetMainTier === currentMainTier) {
    return {
      allowed: false,
      direction: 'none',
      isFree: false,
      cost: {},
      buildTimeHours: 0,
      buildersRequired: 0,
      targetAge: AGES[targetMainTier - 1],
      reason: 'Main is already at target tier.',
    };
  }

  if (targetMainTier < currentMainTier) {
    return {
      allowed: true,
      direction: 'downgrade',
      isFree: true,
      cost: {},
      buildTimeHours: 0,
      buildersRequired: 0,
      targetAge: AGES[targetMainTier - 1],
      reason: null,
    };
  }

  if (targetMainTier !== currentMainTier + 1) {
    return {
      allowed: false,
      direction: 'upgrade',
      isFree: false,
      cost: {},
      buildTimeHours: 0,
      buildersRequired: 0,
      targetAge: AGES[targetMainTier - 1],
      reason: 'Main must upgrade one tier at a time.',
    };
  }

  const upgradeDef = BUILDINGS.main.tierUpgrades?.[targetMainTier];
  if (!upgradeDef) {
    return {
      allowed: false,
      direction: 'upgrade',
      isFree: false,
      cost: {},
      buildTimeHours: 0,
      buildersRequired: 0,
      targetAge: AGES[targetMainTier - 1],
      reason: `Tier ${targetMainTier} upgrade is not yet unlocked in this stage.`,
    };
  }

  const unlockedSet = new Set(unlockedTechs ?? []);
  const missingTech = upgradeDef.requiredTechs.find((techId) => !unlockedSet.has(techId));
  if (missingTech) {
    return {
      allowed: false,
      direction: 'upgrade',
      isFree: false,
      cost: upgradeDef.cost,
      buildTimeHours: upgradeDef.buildTimeHours,
      buildersRequired: upgradeDef.buildersRequired,
      targetAge: upgradeDef.targetAge,
      reason: `Requires technology: ${missingTech}.`,
    };
  }

  return {
    allowed: true,
    direction: 'upgrade',
    isFree: false,
    cost: upgradeDef.cost,
    buildTimeHours: upgradeDef.buildTimeHours,
    buildersRequired: upgradeDef.buildersRequired,
    targetAge: upgradeDef.targetAge,
    reason: null,
  };
}

/**
 * Computes round-trip timestamps for unit field actions (gather, collect_water, hunt),
 * scaling base work duration by the best unlocked tool technology.
 *
 * @param {object} params - Action timing inputs.
 * @param {{ x: number, y: number }} [params.from={ x: 12, y: 12 }] - Main village tile.
 * @param {{ x: number, y: number }} params.to - Target action tile.
 * @param {string} params.unitId - Dispatched unit ID.
 * @param {number} [params.workDurationHours] - Optional work time override in in-game hours.
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked techs.
 * @param {number} [params.nowMs=0] - Real-time epoch timestamp when dispatched.
 * @param {number} [params.efficiencyPenalty=0] - Active village hunger/sickness penalty fraction (0..0.8).
 * @returns {{
 *   distanceKm: number,
 *   oneWayTravelMs: number,
 *   workMs: number,
 *   arrivesAtMs: number,
 *   workCompletedAtMs: number,
 *   returnsAtMs: number,
 * }} Action lifecycle timestamps in real milliseconds.
 */
export function calculateUnitActionTimestamps({
  from = { x: 12, y: 12 },
  to,
  unitId,
  workDurationHours,
  unlockedTechs = STARTER_UNLOCKED_TECHS,
  nowMs = 0,
  efficiencyPenalty = 0,
}) {
  const unitDef = UNITS[unitId];
  if (!unitDef) {
    throw new Error(`Unknown unitId "${unitId}".`);
  }

  const efficiencyMult = Math.max(0.2, 1 - efficiencyPenalty);
  const bestTool = getBestUnlockedTool(unlockedTechs, 'general');
  const speedMult = bestTool?.modifiers?.workSpeedMultiplier ?? 1.0;
  const hours =
    (workDurationHours !== undefined
      ? workDurationHours
      : unitDef.workDurationHours / speedMult) / efficiencyMult;

  const distanceKm = calculateTileDistanceKm(from, to);
  const oneWayTravelMs = Math.round(
    (distanceKm / (unitDef.speedKmPerHour * efficiencyMult)) * REAL_MS_PER_INGAME_HOUR,
  );
  const workMs = Math.round(hours * REAL_MS_PER_INGAME_HOUR);
  const arrivesAtMs = nowMs + oneWayTravelMs;
  const workCompletedAtMs = arrivesAtMs + workMs;

  return {
    distanceKm,
    oneWayTravelMs,
    workMs,
    arrivesAtMs,
    workCompletedAtMs,
    returnsAtMs: workCompletedAtMs + oneWayTravelMs,
  };
}

/**
 * Computes round-trip timestamps for a multi-unit team (`e.g. 2 Gatherers + 1 Hunter`),
 * marching together at the slowest active unit's movement speed.
 *
 * @param {object} params - Team dispatch parameters.
 * @param {{ x: number, y: number }} [params.from={ x: 12, y: 12 }] - Main village tile.
 * @param {{ x: number, y: number }} params.to - Target action tile.
 * @param {Record<string, number>} [params.units={}] - Unit counts in the team (`{ gatherer, hunter }`).
 * @param {number} [params.workDurationHours] - Optional work duration override in in-game hours.
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked techs.
 * @param {number} [params.nowMs=0] - Virtual clock timestamp when dispatched.
 * @param {number} [params.efficiencyPenalty=0] - Active village hunger/sickness penalty fraction (0..0.8).
 * @returns {{
 *   distanceKm: number,
 *   teamSpeedKmPerHour: number,
 *   oneWayTravelMs: number,
 *   workMs: number,
 *   arrivesAtMs: number,
 *   workCompletedAtMs: number,
 *   returnsAtMs: number,
 * }} Synchronized team lifecycle timestamps in virtual milliseconds.
 * @throws {RangeError} When team contains zero units.
 */
export function calculateTeamActionTimestamps({
  from = { x: 12, y: 12 },
  to,
  units = {},
  workDurationHours,
  unlockedTechs = STARTER_UNLOCKED_TECHS,
  nowMs = 0,
  efficiencyPenalty = 0,
}) {
  const activeEntries = Object.entries(units ?? {}).filter(
    ([unitId, count]) => UNITS[unitId] && Number(count) > 0,
  );
  if (activeEntries.length === 0) {
    throw new RangeError('Team action requires at least 1 active unit.');
  }

  const teamSpeedKmPerHour = Math.min(
    ...activeEntries.map(([unitId]) => UNITS[unitId].speedKmPerHour),
  );
  const baseWorkHours = Math.max(
    ...activeEntries.map(([unitId]) => UNITS[unitId].workDurationHours),
  );

  const efficiencyMult = Math.max(0.2, 1 - efficiencyPenalty);
  const bestTool = getBestUnlockedTool(unlockedTechs, 'general');
  const speedMult = bestTool?.modifiers?.workSpeedMultiplier ?? 1.0;
  const hours =
    (workDurationHours !== undefined ? workDurationHours : baseWorkHours / speedMult) /
    efficiencyMult;

  const distanceKm = calculateTileDistanceKm(from, to);
  const oneWayTravelMs = Math.round(
    (distanceKm / (teamSpeedKmPerHour * efficiencyMult)) * REAL_MS_PER_INGAME_HOUR,
  );
  const workMs = Math.round(hours * REAL_MS_PER_INGAME_HOUR);
  const arrivesAtMs = nowMs + oneWayTravelMs;
  const workCompletedAtMs = arrivesAtMs + workMs;

  return {
    distanceKm,
    teamSpeedKmPerHour,
    oneWayTravelMs,
    workMs,
    arrivesAtMs,
    workCompletedAtMs,
    returnsAtMs: workCompletedAtMs + oneWayTravelMs,
  };
}

/**
 * Classifies a running asynchronous task into its current lifecycle phase and countdown.
 *
 * @param {{ arrivesAtMs?: number | null, completedAtMs: number, returnsAtMs?: number | null }} task
 * @param {number} nowMs - Current virtual simulation timestamp.
 * @returns {{
 *   phase: 'going' | 'doing' | 'returning' | 'done',
 *   phaseLabel: 'Traveling' | 'Working' | 'Returning' | 'Done',
 *   phaseRemainingMs: number,
 *   totalRemainingMs: number,
 * }} Current phase metadata and remaining milliseconds.
 */
export function getTaskPhase(task, nowMs) {
  const returnsAtMs = task.returnsAtMs ?? task.completedAtMs;
  const totalRemainingMs = Math.max(0, returnsAtMs - nowMs);

  if (typeof task.arrivesAtMs === 'number' && nowMs < task.arrivesAtMs) {
    return {
      phase: 'going',
      phaseLabel: 'Traveling',
      phaseRemainingMs: task.arrivesAtMs - nowMs,
      totalRemainingMs,
    };
  }

  if (nowMs < task.completedAtMs) {
    return {
      phase: 'doing',
      phaseLabel: 'Working',
      phaseRemainingMs: task.completedAtMs - nowMs,
      totalRemainingMs,
    };
  }

  if (nowMs < returnsAtMs) {
    return {
      phase: 'returning',
      phaseLabel: 'Returning',
      phaseRemainingMs: returnsAtMs - nowMs,
      totalRemainingMs,
    };
  }

  return {
    phase: 'done',
    phaseLabel: 'Done',
    phaseRemainingMs: 0,
    totalRemainingMs: 0,
  };
}

/**
 * Classifies a Territory tile into Stone Age gather/hunt terrain categories.
 *
 * @param {{ isWater?: boolean, forestDensity?: number }} tile - Territory sub-tile object.
 * @returns {'water' | 'forest' | 'fields'} Terrain category.
 */
export function classifyTerritoryTile(tile) {
  if (tile?.isWater) return 'water';
  if ((tile?.forestDensity ?? 0) >= TERRITORY_FOREST_THRESHOLD) return 'forest';
  return 'fields';
}

/**
 * Draws an inclusive integer between `min` and `max` from a caller-provided PRNG.
 *
 * @param {() => number} rng - Seeded RNG returning [0, 1).
 * @param {number} min - Inclusive minimum.
 * @param {number} max - Inclusive maximum.
 * @returns {number} Integer within [min, max].
 */
function rollInt(rng, min, max) {
  if (min >= max) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Selects which ore nugget drops when panning water tiles using ore rarity weights
 * and a 2x bonus when the ore is natively hosted by the Territory's rockType.
 * Never returns flux or coal; can roll any ore in `PANNABLE_ORE_IDS`.
 *
 * @param {() => number} rng - Seeded PRNG function returning [0, 1).
 * @param {string[]} [availableOres=[]] - Optional regional ores present in the Territory rock.
 * @returns {string} Nugget resourceId (e.g. 'copper_nugget').
 */
function pickPannableNuggetId(rng, availableOres = []) {
  const localSet = new Set(availableOres);
  let totalWeight = 0;

  const weighted = PANNABLE_ORE_IDS.map((oreId) => {
    const rarity = ORES[oreId]?.rarity ?? 'common';
    const baseWeight = ORE_RARITY_PANNING_WEIGHTS[rarity] ?? 10;
    const weight = localSet.has(oreId) ? baseWeight * LOCAL_ROCK_ORE_MULTIPLIER : baseWeight;
    totalWeight += weight;
    return { oreId, weight };
  });

  let cursor = rng() * totalWeight;
  for (const entry of weighted) {
    if (cursor < entry.weight) {
      return `${entry.oreId}_nugget`;
    }
    cursor -= entry.weight;
  }

  return `${weighted[weighted.length - 1].oreId}_nugget`;
}

/**
 * Resolves a probabilistic yield roll for a Gatherer or Hunter acting on a tile.
 * Applies the best unlocked tool modifiers (`nothingWeightMultiplier`, `yieldBonus`).
 *
 * @param {object} params - Action resolution inputs.
 * @param {string} params.unitId - 'gatherer' | 'hunter'.
 * @param {string} params.action - 'gather' | 'collect_water' | 'hunt'.
 * @param {{ isWater?: boolean, forestDensity?: number }} params.tile - Target Territory tile.
 * @param {string[]} [params.availableOres=[]] - Regional Territory ores for panning bias.
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked techs.
 * @param {number} [params.efficiencyPenalty=0] - Active village hunger/sickness penalty fraction (0..0.8).
 * @param {() => number} params.rng - Explicit seeded PRNG returning [0, 1) (Math.random is never called).
 * @returns {{
 *   terrain: 'water' | 'forest' | 'fields',
 *   items: Record<string, number>,
 *   waterBowls: number,
 *   foundNothing: boolean,
 * }} Deterministic action yield.
 * @throws {Error} When unit cannot perform the action, tile biome is invalid, or `rng` is missing.
 */
export function rollTileActionYield({
  unitId,
  action,
  tile,
  availableOres = [],
  unlockedTechs = STARTER_UNLOCKED_TECHS,
  efficiencyPenalty = 0,
  rng,
}) {
  const unitDef = UNITS[unitId];
  if (!unitDef) {
    throw new Error(`Unknown unitId "${unitId}".`);
  }
  if (!unitDef.allowedActions.includes(action)) {
    throw new Error(`Unit "${unitId}" cannot perform action "${action}".`);
  }

  const terrain = classifyTerritoryTile(tile);
  const efficiencyMult = Math.max(0.2, 1 - efficiencyPenalty);

  if (action === 'collect_water') {
    if (terrain !== 'water') {
      throw new RangeError('Action "collect_water" can only target a water tile.');
    }
    return {
      terrain,
      items: {},
      waterBowls: Math.max(1, Math.round(WATER_BOWLS_PER_JAR * efficiencyMult)),
      foundNothing: false,
    };
  }

  if (typeof rng !== 'function') {
    throw new TypeError('rollTileActionYield requires a seeded rng() function.');
  }

  const table = TILE_ACTION_TABLES[action]?.[terrain];
  if (!table) {
    throw new Error(`No yield table configured for action "${action}" on "${terrain}".`);
  }

  const bestTool = getBestUnlockedTool(unlockedTechs, 'general');
  const nothingMult = bestTool?.modifiers?.nothingWeightMultiplier ?? 1.0;
  const yieldBonus = bestTool?.modifiers?.yieldBonus ?? 0;

  const adjustedEntries = table.map((entry) => ({
    ...entry,
    effectiveWeight:
      entry.itemId === null ? entry.weight * nothingMult : entry.weight * efficiencyMult,
  }));

  const totalWeight = adjustedEntries.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
  let cursor = rng() * totalWeight;
  let picked = adjustedEntries[adjustedEntries.length - 1];

  for (const entry of adjustedEntries) {
    if (cursor < entry.effectiveWeight) {
      picked = entry;
      break;
    }
    cursor -= entry.effectiveWeight;
  }

  if (!picked.itemId) {
    return { terrain, items: {}, waterBowls: 0, foundNothing: true };
  }

  const rawQty = rollInt(rng, picked.min, picked.max + yieldBonus);
  const qty = efficiencyPenalty > 0 ? Math.max(1, Math.round(rawQty * efficiencyMult)) : rawQty;
  const itemId =
    picked.itemId === 'ore_nugget' ? pickPannableNuggetId(rng, availableOres) : picked.itemId;

  return {
    terrain,
    items: { [itemId]: qty },
    waterBowls: 0,
    foundNothing: false,
  };
}

/**
 * Deterministically resolves wild Wolf (10%) or Bear (4%) encounters in forests.
 * Unescorted Gatherers risk 1 death; Hunters slay the predator for bonus Meat, Bones & Pelts.
 *
 * @param {object} params
 * @param {{ gatherer?: number, hunter?: number }} [params.units={}]
 * @param {string[] | Set<string>} [params.unlockedTechs=[]]
 * @param {() => number} params.rng - Seeded PRNG function.
 * @returns {{
 *   predator: 'wolf' | 'bear' | null,
 *   killedPredator: boolean,
 *   casualties: { gatherer: number, hunter: number },
 *   bonusLoot: Record<string, number>,
 * }} Predator encounter resolution.
 */
export function rollForestPredatorEncounter({ units = {}, unlockedTechs = [], rng }) {
  if (typeof rng !== 'function') {
    return {
      predator: null,
      killedPredator: false,
      casualties: { gatherer: 0, hunter: 0 },
      bonusLoot: {},
    };
  }

  const gatherers = Math.max(0, Math.floor(units.gatherer ?? 0));
  const hunters = Math.max(0, Math.floor(units.hunter ?? 0));
  const roll = rng();
  const predator = roll < 0.04 ? 'bear' : roll < 0.14 ? 'wolf' : null;
  if (!predator) {
    return {
      predator: null,
      killedPredator: false,
      casualties: { gatherer: 0, hunter: 0 },
      bonusLoot: {},
    };
  }

  if (hunters === 0) {
    const deathChance = predator === 'bear' ? 0.7 : 0.35;
    const gDead = gatherers > 0 && rng() < deathChance ? 1 : 0;
    return {
      predator,
      killedPredator: false,
      casualties: { gatherer: gDead, hunter: 0 },
      bonusLoot: {},
    };
  }

  const unlocked = unlockedTechs instanceof Set ? unlockedTechs : new Set(unlockedTechs);
  const hDead =
    predator === 'bear' && hunters === 1 && !unlocked.has('copper_spear') && rng() < 0.2 ? 1 : 0;
  const bonusLoot =
    predator === 'bear'
      ? { meat: 5, bones: 4, pelts: 3 }
      : { meat: 2, bones: 2, pelts: 1 };

  return {
    predator,
    killedPredator: true,
    casualties: { gatherer: 0, hunter: hDead },
    bonusLoot,
  };
}

/**
 * Resolves combined yields for a dispatched unit team (`{ gatherer, hunter, water }`).
 * - `'team'`: Smart Role Assignment — Gatherers roll `'gather'`, Hunters roll `'hunt'`, and Water collectors gather `10` bowls each.
 * - `'collect_water'`: All Gatherers and Hunters collect `1` jar (`10` bowls) each on water tiles.
 * - `'gather'` / `'hunt'`: Only units matching the chosen specialty execute yield rolls.
 *
 * @param {object} params - Team resolution inputs.
 * @param {Record<string, number>} [params.units={}] - Assigned role counts `{ gatherer, hunter, water }`.
 * @param {'team' | 'gather' | 'hunt' | 'collect_water'} params.action - Selected team action.
 * @param {{ isWater?: boolean, forestDensity?: number }} params.tile - Target Territory tile.
 * @param {string[]} [params.availableOres=[]] - Regional Territory ores.
 * @param {string[] | Set<string>} [params.unlockedTechs=STARTER_UNLOCKED_TECHS] - Player unlocked techs.
 * @param {number} [params.efficiencyPenalty=0] - Active village hunger/sickness penalty fraction (0..0.8).
 * @param {() => number} params.rng - Explicit seeded PRNG function.
 * @returns {{
 *   terrain: 'water' | 'forest' | 'fields',
 *   items: Record<string, number>,
 *   waterBowls: number,
 *   rollsExecuted: number,
 *   emptyRolls: number,
 *   encounter: object | null,
 * }} Aggregated team yields and optional predator outcome.
 */
export function resolveTeamActionYield({
  units = {},
  action,
  tile,
  availableOres = [],
  unlockedTechs = STARTER_UNLOCKED_TECHS,
  efficiencyPenalty = 0,
  rng,
}) {
  const gatherers = Math.max(0, Math.floor(units.gatherer ?? 0));
  const hunters = Math.max(0, Math.floor(units.hunter ?? 0));
  const waterCollectors = Math.max(0, Math.floor(units.water ?? 0));
  const terrain = classifyTerritoryTile(tile);
  const efficiencyMult = Math.max(0.2, 1 - efficiencyPenalty);
  const bowlsPerJar = Math.max(1, Math.round(WATER_BOWLS_PER_JAR * efficiencyMult));

  if (action === 'collect_water') {
    const totalCollectors = waterCollectors > 0 ? waterCollectors : gatherers + hunters;
    if (totalCollectors < 1) {
      throw new Error('Collect Water requires at least 1 Gatherer or Hunter.');
    }
    if (terrain !== 'water') {
      throw new RangeError('Action "collect_water" can only target a water tile.');
    }
    return {
      terrain,
      items: {},
      waterBowls: totalCollectors * bowlsPerJar,
      rollsExecuted: totalCollectors,
      emptyRolls: 0,
      encounter: null,
    };
  }

  const items = {};
  let waterBowls = 0;
  let rollsExecuted = 0;
  let emptyRolls = 0;

  const runRolls = (unitId, rollAction, count) => {
    for (let i = 0; i < count; i += 1) {
      const res = rollTileActionYield({
        unitId,
        action: rollAction,
        tile,
        availableOres,
        unlockedTechs,
        efficiencyPenalty,
        rng,
      });
      rollsExecuted += 1;
      if (res.foundNothing) {
        emptyRolls += 1;
      } else {
        for (const [id, qty] of Object.entries(res.items)) {
          items[id] = (items[id] ?? 0) + qty;
        }
      }
    }
  };

  let encounter = null;
  const applyForestEncounter = (teamUnits) => {
    if (terrain !== 'forest' || typeof rng !== 'function') return;
    encounter = rollForestPredatorEncounter({ units: teamUnits, unlockedTechs, rng });
    for (const [id, qty] of Object.entries(encounter.bonusLoot ?? {})) {
      items[id] = (items[id] ?? 0) + qty;
    }
  };

  if (action === 'team') {
    if (gatherers + hunters + waterCollectors < 1) {
      throw new Error('Team action requires at least 1 assigned unit.');
    }
    if (waterCollectors > 0 && terrain !== 'water') {
      throw new RangeError('Water collection inside a team can only target a water tile.');
    }
    if (gatherers > 0) runRolls('gatherer', 'gather', gatherers);
    if (hunters > 0) runRolls('hunter', 'hunt', hunters);
    if (waterCollectors > 0) {
      waterBowls = waterCollectors * bowlsPerJar;
      rollsExecuted += waterCollectors;
    }
    applyForestEncounter({ gatherer: gatherers, hunter: hunters });
    return { terrain, items, waterBowls, rollsExecuted, emptyRolls, encounter };
  }

  const actingUnitId = action === 'gather' ? 'gatherer' : action === 'hunt' ? 'hunter' : null;
  if (!actingUnitId) {
    throw new Error(`Unsupported team action "${action}".`);
  }

  const actingCount = actingUnitId === 'gatherer' ? gatherers : hunters;
  if (actingCount < 1) {
    throw new Error(`Action "${action}" requires at least 1 ${UNITS[actingUnitId].name}.`);
  }

  runRolls(actingUnitId, action, actingCount);
  applyForestEncounter({
    gatherer: actingUnitId === 'gatherer' ? actingCount : 0,
    hunter: actingUnitId === 'hunter' ? actingCount : 0,
  });

  return {
    terrain,
    items,
    waterBowls,
    rollsExecuted,
    emptyRolls,
    encounter,
  };
}

/**
 * Creates a Territory exploration bitmask initialized to 0 with a centered 7x7 starter region set to 1.
 *
 * @param {number} [size=25] - Territory grid width/height.
 * @returns {Uint8Array} Row-major exploration mask (`1` = explored, `0` = fogged).
 */
export function createInitialTerritoryFog(size = DEFAULT_TERRITORY_SIZE) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Territory size must be a positive integer, got ${size}.`);
  }

  const fog = new Uint8Array(size * size);
  const center = Math.floor(size / 2);
  const half = Math.floor(INITIAL_TERRITORY_EXPLORE_SIZE / 2);
  const minCoord = Math.max(0, center - half);
  const maxCoord = Math.min(size - 1, center + half);

  for (let y = minCoord; y <= maxCoord; y += 1) {
    for (let x = minCoord; x <= maxCoord; x += 1) {
      fog[y * size + x] = 1;
    }
  }

  return fog;
}

/**
 * Reveals the `(2*radius + 1) x (2*radius + 1)` box (default 3x3) around a target tile.
 * Matches border-pushing exploration (`[[1,1,1],[1,1,1],[1,1,x]] -> reveals outer border around x`).
 *
 * @param {Uint8Array} fogGrid - Current exploration bitmask (`1` = explored, `0` = fogged).
 * @param {number} size - Square grid dimension.
 * @param {number} centerX - Action tile X coordinate.
 * @param {number} centerY - Action tile Y coordinate.
 * @param {object} [options] - Optional constraints.
 * @param {boolean} [options.requireCenterExplored=true] - Require `(centerX, centerY)` already be `1`.
 * @param {number} [options.radius=1] - Reveal radius around `(centerX, centerY)`.
 * @returns {{
 *   fog: Uint8Array,
 *   newlyRevealedCount: number,
 *   totalExplored: number,
 *   isFullyExplored: boolean,
 * }} Updated fog copy and coverage counters.
 */
export function revealBox3x3(
  fogGrid,
  size,
  centerX,
  centerY,
  { requireCenterExplored = true, radius = EXPLORE_REVEAL_RADIUS } = {},
) {
  if (centerX < 0 || centerX >= size || centerY < 0 || centerY >= size) {
    throw new RangeError(`Reveal center (${centerX}, ${centerY}) out of bounds for size ${size}.`);
  }

  const centerIdx = centerY * size + centerX;
  if (requireCenterExplored && fogGrid[centerIdx] !== 1) {
    throw new Error(`Target tile (${centerX}, ${centerY}) must be explored before revealing around it.`);
  }

  const nextFog = new Uint8Array(fogGrid);
  let newlyRevealedCount = 0;

  const minY = Math.max(0, centerY - radius);
  const maxY = Math.min(size - 1, centerY + radius);
  const minX = Math.max(0, centerX - radius);
  const maxX = Math.min(size - 1, centerX + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = y * size + x;
      if (nextFog[idx] === 0) {
        nextFog[idx] = 1;
        newlyRevealedCount += 1;
      }
    }
  }

  let totalExplored = 0;
  for (let i = 0; i < nextFog.length; i += 1) {
    if (nextFog[i] === 1) totalExplored += 1;
  }

  return {
    fog: nextFog,
    newlyRevealedCount,
    totalExplored,
    isFullyExplored: totalExplored === size * size,
  };
}

/**
 * Unlocks the 1-tile (3x3) Continent ring around the player's home village once all
 * tiles of their home Territory (`25x25 = 625`) have been explored.
 *
 * @param {object} params - Continent fog unlock inputs.
 * @param {Uint8Array} params.continentFog - Current Continent exploration mask.
 * @param {number} [params.continentSize=100] - Continent grid dimension.
 * @param {number} params.villageX - Home village X coordinate on the Continent.
 * @param {number} params.villageY - Home village Y coordinate on the Continent.
 * @param {number} params.territoryExploredCount - Explored count in home Territory.
 * @param {number} [params.territoryTotalTiles=625] - Total tiles in home Territory.
 * @returns {{ unlocked: boolean, fog: Uint8Array, newlyRevealedCount: number }} Continent unlock result.
 */
export function unlockContinentRingIfTerritoryComplete({
  continentFog,
  continentSize = DEFAULT_CONTINENT_SIZE,
  villageX,
  villageY,
  territoryExploredCount,
  territoryTotalTiles = DEFAULT_TERRITORY_SIZE * DEFAULT_TERRITORY_SIZE,
}) {
  if (territoryExploredCount < territoryTotalTiles) {
    return { unlocked: false, fog: new Uint8Array(continentFog), newlyRevealedCount: 0 };
  }

  const res = revealBox3x3(continentFog, continentSize, villageX, villageY, {
    requireCenterExplored: false,
    radius: 1,
  });

  return {
    unlocked: true,
    fog: res.fog,
    newlyRevealedCount: res.newlyRevealedCount,
  };
}

/**
 * Selects a deterministic starter village coordinate on the Continent inside the
 * central North-South band (30%..70% height) across the full West-East range.
 * Guarantees the chosen tile is buildable, skips `excludedCoords`, and never overlaps The Obelisk.
 *
 * @param {{ size: number, tiles: Array<object>, obeliskCoords?: { x: number, y: number } }} continent
 * @param {string | number} [seed='obelisk-alpha'] - World seed used for deterministic tie-breaking.
 * @param {Array<{ x: number, y: number }>} [excludedCoords=[]] - Previously abandoned village coords to skip.
 * @returns {object} Selected starter Continent tile.
 * @throws {Error} When no buildable non-Obelisk tile exists on the Continent.
 */
export function pickStarterSpawnTile(continent, seed = 'obelisk-alpha', excludedCoords = []) {
  const { size, tiles, obeliskCoords } = continent;
  const minY = Math.floor(size * 0.3);
  const maxY = Math.max(minY, Math.ceil(size * 0.7) - 1);
  const excludedSet = new Set((excludedCoords ?? []).map((c) => `${c.x},${c.y}`));

  const isEligible = (tile, ignoreExcluded = false) =>
    Boolean(tile?.buildable) &&
    !tile.isObelisk &&
    !(obeliskCoords && tile.x === obeliskCoords.x && tile.y === obeliskCoords.y) &&
    (ignoreExcluded || !excludedSet.has(`${tile.x},${tile.y}`));

  const bandCandidates = tiles.filter(
    (tile) => isEligible(tile) && tile.y >= minY && tile.y <= maxY,
  );
  const pool =
    bandCandidates.length > 0
      ? bandCandidates
      : tiles.filter((t) => isEligible(t)).length > 0
        ? tiles.filter((t) => isEligible(t))
        : tiles.filter((t) => isEligible(t, true));

  if (pool.length === 0) {
    throw new Error('No buildable non-Obelisk Continent tile available for starter spawn.');
  }

  const rng = createPrng(hashSeed(`${String(seed)}:starter_spawn`));
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Computes the inclusive explored bounding box and tile count from a fog bitmask.
 * Used to auto-zoom and center Territory (7x7 -> 25x25) and Continent (1x1 -> 3x3) canvases.
 *
 * @param {Uint8Array | ArrayLike<number>} fogGrid - Row-major exploration bitmask (`1` = revealed).
 * @param {number} size - Square grid dimension.
 * @returns {{
 *   minX: number,
 *   maxX: number,
 *   minY: number,
 *   maxY: number,
 *   width: number,
 *   height: number,
 *   exploredCount: number,
 * }} Bounding box metrics around revealed tiles.
 */
export function getExploredBounds(fogGrid, size) {
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  let exploredCount = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (fogGrid[y * size + x] === 1) {
        exploredCount += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (exploredCount === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, exploredCount: 0 };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    exploredCount,
  };
}
