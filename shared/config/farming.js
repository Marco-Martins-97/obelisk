/**
 * Copper Age agriculture, orchard cultivation, livestock husbandry, and ore prospecting templates.
 *
 * All definitions are immutable and data-driven so additional crops, trees, and animals
 * can be added cleanly in Bronze/Iron Ages without schema changes.
 */

/**
 * Normalizes a seasonal annual crop template for Crop Fields (8x8 = 64 slots).
 *
 * @param {object} config - Crop parameters.
 * @param {string} config.id - Resource ID harvested & planted (`grain`, `flax`, `vegetables`).
 * @param {string} config.name - Human-readable display name.
 * @param {string} config.seedItemId - Inventory/reserve item ID consumed to plant 1 slot.
 * @param {string} config.harvestItemId - Inventory item ID produced on harvest.
 * @param {'A' | 'B' | 'C'} config.nutrientType - TFC-inspired soil nutrient consumed per cycle.
 * @param {number} [config.nutrientCost=30] - Nutrient points (out of 100) consumed across growth.
 * @param {number} [config.growthDays=60] - In-game days to mature when planted in Spring.
 * @param {number} [config.harvestWindowDays=30] - Days remaining mature before crops wither & die.
 * @param {number} config.minTempC - Minimum safe ambient temperature (°C).
 * @param {number} config.maxTempC - Maximum safe ambient temperature (°C).
 * @param {number} [config.yieldMin=3] - Minimum harvest yield per surviving slot.
 * @param {number} [config.yieldMax=10] - Maximum harvest yield per surviving slot.
 * @param {string} [config.description=''] - Short tooltip summary.
 * @returns {Readonly<object>} Immutable crop template.
 */
export function createCrop(config) {
  if (!config?.id || !config?.name || !config?.seedItemId || !config?.harvestItemId) {
    throw new Error('Crop template requires id, name, seedItemId, and harvestItemId.');
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    seedItemId: config.seedItemId,
    harvestItemId: config.harvestItemId,
    nutrientType: config.nutrientType ?? 'A',
    nutrientCost: config.nutrientCost ?? 30,
    growthDays: config.growthDays ?? 60,
    harvestWindowDays: config.harvestWindowDays ?? 30,
    minTempC: config.minTempC ?? 4,
    maxTempC: config.maxTempC ?? 32,
    yieldMin: config.yieldMin ?? 3,
    yieldMax: config.yieldMax ?? 10,
    slotsPerField: config.slotsPerField ?? 64,
    description: config.description ?? '',
  });
}

/**
 * Normalizes a perennial tree template for Orchards (9 tree slots, annual harvest).
 *
 * @param {object} config - Orchard tree configuration.
 * @param {string} config.id - Tree template ID.
 * @param {string} config.name - Display name.
 * @param {string} [config.saplingItemId='sapling'] - Planting item ID.
 * @param {string} config.outputItemId - Harvested fruit/produce item ID.
 * @param {number} [config.matureDays=336] - In-game days before first annual harvest (1 year).
 * @param {string[]} [config.harvestSeasons=['summer', 'autumn']] - Seasons when mature trees produce.
 * @param {number} [config.minTempC=-5] - Frost death threshold (°C).
 * @param {number} [config.maxTempC=35] - Heat damage threshold (°C).
 * @param {number} [config.yieldPerTree=8] - Harvest units per healthy mature tree.
 * @param {number} [config.slotsPerOrchard=9] - Tree slots per Orchard plot.
 * @param {string} [config.description=''] - Short summary.
 * @returns {Readonly<object>} Immutable orchard tree template.
 */
export function createOrchardTree(config) {
  if (!config?.id || !config?.name || !config?.outputItemId) {
    throw new Error('Orchard tree template requires id, name, and outputItemId.');
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    saplingItemId: config.saplingItemId ?? 'sapling',
    outputItemId: config.outputItemId,
    matureDays: config.matureDays ?? 336,
    harvestSeasons: Object.freeze([...(config.harvestSeasons ?? ['summer', 'autumn'])]),
    minTempC: config.minTempC ?? -5,
    maxTempC: config.maxTempC ?? 35,
    yieldPerTree: config.yieldPerTree ?? 8,
    slotsPerOrchard: config.slotsPerOrchard ?? 9,
    description: config.description ?? '',
  });
}

/**
 * Normalizes a domesticated livestock species captured by Hunters and kept in Animal Pens.
 *
 * @param {object} config - Livestock parameters.
 * @param {string} config.id - Animal species ID (`horse`, `donkey`, `goat`, `sheep`, `chicken`).
 * @param {string} config.name - Display name.
 * @param {string | null} [config.dailyOutputId=null] - Daily resource produced (`milk`, `wool`, `eggs`).
 * @param {number} [config.dailyOutputQty=0] - Units produced per animal per fed day.
 * @param {number} [config.dailyManure=1] - Manure fertilizer produced per fed day.
 * @param {string} [config.feedItemId='grain'] - Daily food item consumed.
 * @param {number} [config.dailyFeedQty=1] - Daily food quantity consumed per animal.
 * @param {number} [config.dailyWaterBowls=1] - Daily water bowls consumed per animal.
 * @param {number} [config.captureWeight=20] - Relative forest encounter capture weight.
 * @param {string} [config.description=''] - Short tooltip summary.
 * @returns {Readonly<object>} Immutable livestock template.
 */
export function createLivestock(config) {
  if (!config?.id || !config?.name) {
    throw new Error('Livestock template requires id and name.');
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    dailyOutputId: config.dailyOutputId ?? null,
    dailyOutputQty: config.dailyOutputQty ?? 0,
    dailyManure: config.dailyManure ?? 1,
    feedItemId: config.feedItemId ?? 'grain',
    dailyFeedQty: config.dailyFeedQty ?? 1,
    dailyWaterBowls: config.dailyWaterBowls ?? 1,
    captureWeight: config.captureWeight ?? 20,
    description: config.description ?? '',
  });
}

/** Registered seasonal crops across TFC soil nutrients A, B, and C. */
export const CROPS = Object.freeze({
  grain: createCrop({
    id: 'grain',
    name: 'Wheat / Grain',
    seedItemId: 'grain',
    harvestItemId: 'grain',
    nutrientType: 'A',
    nutrientCost: 30,
    growthDays: 60,
    harvestWindowDays: 30,
    minTempC: 4,
    maxTempC: 32,
    yieldMin: 3,
    yieldMax: 10,
    description: 'Staple grain seeded in Spring (Nutrient A); yields 3..10 per surviving slot.',
  }),
  flax: createCrop({
    id: 'flax',
    name: 'Wild Flax / Hemp',
    seedItemId: 'roots',
    harvestItemId: 'straw',
    nutrientType: 'B',
    nutrientCost: 25,
    growthDays: 60,
    harvestWindowDays: 30,
    minTempC: 6,
    maxTempC: 28,
    yieldMin: 3,
    yieldMax: 10,
    description: 'Fibrous crop cultivated using Wild Roots stalks (Nutrient B); harvests Straw and fibers.',
  }),
  vegetables: createCrop({
    id: 'vegetables',
    name: 'Root Vegetables',
    seedItemId: 'roots',
    harvestItemId: 'vegetables',
    nutrientType: 'C',
    nutrientCost: 25,
    growthDays: 60,
    harvestWindowDays: 30,
    minTempC: 2,
    maxTempC: 26,
    yieldMin: 3,
    yieldMax: 8,
    description: 'Hardy cold-tolerant vegetables propagated from Wild Roots (Nutrient C) for edible rations.',
  }),
});

/** Registered Orchard tree templates. */
export const ORCHARD_TREES = Object.freeze({
  apple_tree: createOrchardTree({
    id: 'apple_tree',
    name: 'Apple Tree',
    saplingItemId: 'sapling',
    outputItemId: 'apples',
    matureDays: 336,
    harvestSeasons: ['summer', 'autumn'],
    minTempC: -5,
    maxTempC: 35,
    yieldPerTree: 8,
    description: 'Takes 1 full year (336 days) to mature, then bears apples each Summer or Autumn.',
  }),
});

/** Registered livestock species capturable by Hunters with Farm + Animal Pen + Spear. */
export const LIVESTOCK = Object.freeze({
  horse: createLivestock({
    id: 'horse',
    name: 'Horse',
    dailyOutputId: null,
    dailyOutputQty: 0,
    captureWeight: 18,
    description: 'Mount required to train Scouts (1 Horse + 1 Pop); produces 1 Manure/day.',
  }),
  donkey: createLivestock({
    id: 'donkey',
    name: 'Donkey',
    dailyOutputId: null,
    dailyOutputQty: 0,
    captureWeight: 18,
    description: 'Pack animal required to craft Caravans (1 Donkey + 1 Pop); produces 1 Manure/day.',
  }),
  goat: createLivestock({
    id: 'goat',
    name: 'Goat',
    dailyOutputId: 'milk',
    dailyOutputQty: 1,
    captureWeight: 22,
    description: 'Produces 1 Milk and 1 Manure per fed day.',
  }),
  sheep: createLivestock({
    id: 'sheep',
    name: 'Sheep',
    dailyOutputId: 'wool',
    dailyOutputQty: 1,
    captureWeight: 20,
    description: 'Produces 1 Wool and 1 Manure per fed day.',
  }),
  chicken: createLivestock({
    id: 'chicken',
    name: 'Chicken',
    dailyOutputId: 'eggs',
    dailyOutputQty: 1,
    captureWeight: 22,
    description: 'Produces 1 Egg and 1 Manure per fed day.',
  }),
});

/** Ordered qualitative sample labels used in Prospector reports. */
export const ORE_SAMPLE_TIERS = Object.freeze([
  Object.freeze({ minDensity: 0.8, label: 'Very Large Sample' }),
  Object.freeze({ minDensity: 0.6, label: 'Large Sample' }),
  Object.freeze({ minDensity: 0.35, label: 'Medium Sample' }),
  Object.freeze({ minDensity: 0.15, label: 'Small Sample' }),
  Object.freeze({ minDensity: 0.05, label: 'Tiny Sample' }),
  Object.freeze({ minDensity: 0, label: 'Nothing Found' }),
]);

/**
 * Maps a raw normalized ore layer value `[0, 1]` to a TFC-style prospecting sample tier.
 *
 * @param {number} density - Tile ore layer density in [0, 1].
 * @returns {'Nothing Found' | 'Tiny Sample' | 'Small Sample' | 'Medium Sample' | 'Large Sample' | 'Very Large Sample'}
 */
export function classifyOreDensitySample(density) {
  const val = Math.max(0, Math.min(1, Number(density) || 0));
  for (const tier of ORE_SAMPLE_TIERS) {
    if (val >= tier.minDensity) {
      return tier.label;
    }
  }
  return 'Nothing Found';
}
