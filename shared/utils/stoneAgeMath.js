/**
 * Pure deterministic Stone Age game math, timers, daily survival, yields, and fog rules.
 *
 * Isomorphic & environment-agnostic: never uses Node/DOM APIs or Math.random().
 * All probabilistic helpers accept an explicit seeded `rng()` callback.
 */

import { BUILDINGS } from '../config/buildings.js';
import { PANNABLE_ORE_IDS, RESOURCES } from '../config/resources.js';
import { UNITS } from '../config/units.js';
import {
  DAYS_PER_MONTH,
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  EXPLORE_REVEAL_RADIUS,
  HOURS_PER_INGAME_DAY,
  INITIAL_TERRITORY_EXPLORE_SIZE,
  MONTHS_PER_SEASON,
  REAL_MS_PER_INGAME_HOUR,
  SEASONS_PER_YEAR,
  SEASON_NAMES,
  TERRITORY_TILE_DISTANCE_KM,
  WATER_BOWLS_PER_JAR,
} from '../config/worldConstants.js';
import { TERRITORY_FOREST_THRESHOLD } from '../generators/territoryGenerator.js';

/**
 * Probabilistic gather and hunt tables keyed by unit -> biome category.
 * Weights sum cleanly so a non-zero roll can occasionally yield nothing (`itemId: null`).
 */
export const TILE_ACTION_TABLES = Object.freeze({
  gather: Object.freeze({
    fields: Object.freeze([
      { itemId: 'small_stones', min: 1, max: 2, weight: 28 },
      { itemId: 'seeds', min: 1, max: 2, weight: 26 },
      { itemId: 'straw', min: 1, max: 2, weight: 28 },
      { itemId: null, min: 0, max: 0, weight: 18 },
    ]),
    forest: Object.freeze([
      { itemId: 'sticks', min: 1, max: 3, weight: 45 },
      { itemId: 'berries', min: 1, max: 3, weight: 37 },
      { itemId: null, min: 0, max: 0, weight: 18 },
    ]),
    water: Object.freeze([
      { itemId: 'clay', min: 1, max: 2, weight: 50 },
      { itemId: 'ore_nugget', min: 1, max: 1, weight: 32 },
      { itemId: null, min: 0, max: 0, weight: 18 },
    ]),
  }),
  hunt: Object.freeze({
    fields: Object.freeze([
      { itemId: 'grain', min: 1, max: 2, weight: 75 },
      { itemId: null, min: 0, max: 0, weight: 25 },
    ]),
    forest: Object.freeze([
      { itemId: 'meat', min: 1, max: 2, weight: 48 },
      { itemId: 'pelts', min: 1, max: 2, weight: 32 },
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
    if (!def || def.popBonusPerLevel <= 0) continue;
    const level = Math.max(1, Math.min(instance.level ?? 1, def.maxLevel));
    maxPop += def.popBonusPerLevel * level;
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
}) {
  const def = BUILDINGS[buildingId];
  if (!def) {
    throw new Error(`Unknown buildingId "${buildingId}".`);
  }

  const distanceKm = calculateTileDistanceKm(from, to);
  const oneWayTravelMs = Math.round((distanceKm / speedKmPerHour) * REAL_MS_PER_INGAME_HOUR);
  const buildMs = Math.round(def.buildTimeHours * REAL_MS_PER_INGAME_HOUR);
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
 * Computes round-trip timestamps for unit field actions (gather, collect_water, hunt).
 *
 * @param {object} params - Action timing inputs.
 * @param {{ x: number, y: number }} [params.from={ x: 12, y: 12 }] - Main village tile.
 * @param {{ x: number, y: number }} params.to - Target action tile.
 * @param {string} params.unitId - Dispatched unit ID.
 * @param {number} [params.workDurationHours] - Optional work time override in in-game hours.
 * @param {number} [params.nowMs=0] - Real-time epoch timestamp when dispatched.
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
  nowMs = 0,
}) {
  const unitDef = UNITS[unitId];
  if (!unitDef) {
    throw new Error(`Unknown unitId "${unitId}".`);
  }

  const hours = workDurationHours ?? unitDef.workDurationHours;
  const distanceKm = calculateTileDistanceKm(from, to);
  const oneWayTravelMs = Math.round((distanceKm / unitDef.speedKmPerHour) * REAL_MS_PER_INGAME_HOUR);
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
 * Selects which ore nugget drops when panning water tiles.
 * Never returns flux or coal; can roll any ore in `PANNABLE_ORE_IDS`.
 *
 * @param {() => number} rng - Seeded PRNG function returning [0, 1).
 * @param {string[]} [availableOres=[]] - Optional regional ores present in the Territory rock.
 * @returns {string} Nugget resourceId (e.g. 'copper_nugget').
 */
function pickPannableNuggetId(rng, availableOres = []) {
  const regionalPannable = availableOres.filter((ore) => PANNABLE_ORE_IDS.includes(ore));
  // Bias 60% toward local rock geology when available, while still letting players pan any world ore (except flux/coal).
  const pool =
    regionalPannable.length > 0 && rng() < 0.6 ? regionalPannable : PANNABLE_ORE_IDS;
  const chosenOre = pool[Math.floor(rng() * pool.length)];
  return `${chosenOre}_nugget`;
}

/**
 * Resolves a probabilistic yield roll for a Gatherer or Hunter acting on a tile.
 * Gather/hunt rolls may return nothing (`foundNothing: true`); `collect_water` on water returns 1 jar (10 bowls).
 *
 * @param {object} params - Action resolution inputs.
 * @param {string} params.unitId - 'gatherer' | 'hunter'.
 * @param {string} params.action - 'gather' | 'collect_water' | 'hunt'.
 * @param {{ isWater?: boolean, forestDensity?: number }} params.tile - Target Territory tile.
 * @param {string[]} [params.availableOres=[]] - Regional Territory ores for panning bias.
 * @param {() => number} params.rng - Explicit seeded PRNG returning [0, 1) (Math.random is never called).
 * @returns {{
 *   terrain: 'water' | 'forest' | 'fields',
 *   items: Record<string, number>,
 *   waterBowls: number,
 *   foundNothing: boolean,
 * }} Deterministic action yield.
 * @throws {Error} When unit cannot perform the action, tile biome is invalid, or `rng` is missing.
 */
export function rollTileActionYield({ unitId, action, tile, availableOres = [], rng }) {
  const unitDef = UNITS[unitId];
  if (!unitDef) {
    throw new Error(`Unknown unitId "${unitId}".`);
  }
  if (!unitDef.allowedActions.includes(action)) {
    throw new Error(`Unit "${unitId}" cannot perform action "${action}".`);
  }

  const terrain = classifyTerritoryTile(tile);

  if (action === 'collect_water') {
    if (terrain !== 'water') {
      throw new RangeError('Action "collect_water" can only target a water tile.');
    }
    return {
      terrain,
      items: {},
      waterBowls: WATER_BOWLS_PER_JAR,
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

  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * totalWeight;
  let picked = table[table.length - 1];

  for (const entry of table) {
    if (cursor < entry.weight) {
      picked = entry;
      break;
    }
    cursor -= entry.weight;
  }

  if (!picked.itemId) {
    return { terrain, items: {}, waterBowls: 0, foundNothing: true };
  }

  const qty = rollInt(rng, picked.min, picked.max);
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
