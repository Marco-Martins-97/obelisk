/**
 * Universal data-driven Resource templates and starter village pools (Stone Age base).
 *
 * Adding new resources in later Ages only requires adding a `createResource(...)` entry;
 * dynamic player inventories store `{ [resourceId]: count }` without schema migrations.
 */

/** Linear bulk size scale from tiny (1) to large (5). */
export const SIZE_CLASSES = Object.freeze({
  1: 'tiny',
  2: 'small',
  3: 'medium',
  4: 'big',
  5: 'large',
});

/**
 * Normalizes a resource definition with strict default fields and validates sizeClass (1-5).
 *
 * @param {object} config - Resource configuration fields.
 * @param {string} config.id - Unique snake_case resource identifier.
 * @param {string} config.name - Human-readable display name.
 * @param {number} [config.sizeClass=2] - Linear bulk weight class (1=tiny .. 5=large).
 * @param {string} [config.category='material'] - Logical group ('material'|'food'|'tool'|'ore_nugget'|'ingot').
 * @param {string} [config.age='stone'] - Tech age introducing this resource.
 * @param {number} [config.tier=1] - Progression tier.
 * @param {boolean} [config.edible=false] - Whether populations can eat it directly as sustenance.
 * @param {number} [config.foodValue=0] - Daily food units restored per consumed item.
 * @param {number} [config.spoilRatePerDay=0] - Fraction of stored stock spoiled per in-game day (0..1).
 * @param {number} [config.burnTimeSec=0] - Fuel duration when burned (0 if non-combustible).
 * @param {string} [config.description=''] - Short tooltip summary.
 * @returns {Readonly<object>} Immutable normalized resource template.
 * @throws {Error} When required identifiers are missing or sizeClass is outside 1..5.
 */
export function createResource(config) {
  if (!config?.id || !config?.name) {
    throw new Error('Resource template requires non-empty id and name.');
  }

  const sizeClass = config.sizeClass ?? 2;
  if (!Number.isInteger(sizeClass) || sizeClass < 1 || sizeClass > 5) {
    throw new RangeError(`Resource "${config.id}" sizeClass must be an integer 1..5, got ${sizeClass}.`);
  }

  const spoilRatePerDay = config.spoilRatePerDay ?? 0;
  if (!Number.isFinite(spoilRatePerDay) || spoilRatePerDay < 0 || spoilRatePerDay > 1) {
    throw new RangeError(`Resource "${config.id}" spoilRatePerDay must be within 0..1, got ${spoilRatePerDay}.`);
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    category: config.category ?? 'material',
    age: config.age ?? 'stone',
    tier: config.tier ?? 1,
    sizeClass,
    sizeLabel: SIZE_CLASSES[sizeClass],
    stackable: config.stackable ?? true,
    edible: Boolean(config.edible),
    foodValue: config.foodValue ?? 0,
    spoilRatePerDay,
    burnTimeSec: config.burnTimeSec ?? 0,
    description: config.description ?? '',
  });
}

/**
 * Ores eligible to drop as river/lake panning nuggets during Stone Age.
 * Intentionally excludes 'flux' and 'coal'.
 */
export const PANNABLE_ORE_IDS = Object.freeze([
  'copper',
  'iron',
  'tin',
  'nickel',
  'silver',
  'gold',
  'gems',
]);

/** Registry of all Stone Age resources and the Copper Ingot milestone target. */
export const RESOURCES = Object.freeze({
  sticks: createResource({
    id: 'sticks',
    name: 'Sticks',
    sizeClass: 2,
    burnTimeSec: 60,
    description: 'Fallen branches gathered in forests; basic framing and kindling.',
  }),
  straw: createResource({
    id: 'straw',
    name: 'Straw',
    sizeClass: 2,
    burnTimeSec: 20,
    description: 'Dried field grasses gathered on open plains for thatching and kilns.',
  }),
  pelts: createResource({
    id: 'pelts',
    name: 'Pelts',
    sizeClass: 2,
    description: 'Raw animal hides hunted in forests for shelter insulation.',
  }),
  small_stones: createResource({
    id: 'small_stones',
    name: 'Small Stones',
    sizeClass: 2,
    description: 'Loose field stones used for firepits, kilns, and stone tools.',
  }),
  seeds: createResource({
    id: 'seeds',
    name: 'Seeds',
    sizeClass: 1,
    description: 'Wild field seeds gathered for future cultivation.',
  }),
  clay: createResource({
    id: 'clay',
    name: 'Clay',
    sizeClass: 3,
    description: 'Wet riverbank clay dug from water tiles to shape kilns.',
  }),
  charcoal: createResource({
    id: 'charcoal',
    name: 'Charcoal',
    sizeClass: 2,
    burnTimeSec: 300,
    description: 'High-heat kiln fuel required to smelt copper nuggets into ingots.',
  }),
  salt: createResource({
    id: 'salt',
    name: 'Salt',
    sizeClass: 1,
    description: 'Mineral salt harvested by boiling water or mining limestone and shale layers.',
  }),

  // Food & sustenance items
  berries: createResource({
    id: 'berries',
    name: 'Berries',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 1,
    spoilRatePerDay: 0.25,
    description: 'Foraged wild forest berries.',
  }),
  grain: createResource({
    id: 'grain',
    name: 'Wild Grain',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 1,
    spoilRatePerDay: 0.03,
    description: 'Field grain harvested during hunting expeditions.',
  }),
  meat: createResource({
    id: 'meat',
    name: 'Raw Meat',
    category: 'food',
    sizeClass: 3,
    edible: false,
    spoilRatePerDay: 0.45,
    description: 'Hunted forest game; cook at a Firepit or cure on a Drying Rack.',
  }),
  cooked_meat: createResource({
    id: 'cooked_meat',
    name: 'Cooked Meat',
    category: 'food',
    sizeClass: 3,
    edible: true,
    foodValue: 3,
    spoilRatePerDay: 0.2,
    description: 'Roasted meat cooked at a Firepit.',
  }),
  dried_meat: createResource({
    id: 'dried_meat',
    name: 'Dried Meat',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 3,
    spoilRatePerDay: 0.05,
    description: 'Air-dried game meat preserved on a Drying Rack without salt.',
  }),
  salted_meat: createResource({
    id: 'salted_meat',
    name: 'Salted Meat',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 4,
    spoilRatePerDay: 0.01,
    description: 'Salt-cured meat preserved on a Drying Rack for long-term storage.',
  }),
  fish: createResource({
    id: 'fish',
    name: 'Raw Fish',
    category: 'food',
    sizeClass: 2,
    edible: false,
    spoilRatePerDay: 0.5,
    description: 'Fresh river or lake fish; cook at a Firepit or cure on a Drying Rack.',
  }),
  cooked_fish: createResource({
    id: 'cooked_fish',
    name: 'Cooked Fish',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.25,
    description: 'Grilled fish cooked at a Firepit.',
  }),
  dried_fish: createResource({
    id: 'dried_fish',
    name: 'Dried Fish',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.06,
    description: 'Air-dried fish preserved on a Drying Rack without salt.',
  }),
  salted_fish: createResource({
    id: 'salted_fish',
    name: 'Salted Fish',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 3,
    spoilRatePerDay: 0.01,
    description: 'Salt-cured fish preserved on a Drying Rack for long-term storage.',
  }),

  // Copper Age evolution milestone item
  copper_nugget: createResource({
    id: 'copper_nugget',
    name: 'Copper Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Alluvial copper nugget panned from water tiles (10 smelt into 1 ingot).',
  }),
  iron_nugget: createResource({
    id: 'iron_nugget',
    name: 'Iron Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Raw iron nugget panned from water tiles.',
  }),
  tin_nugget: createResource({
    id: 'tin_nugget',
    name: 'Tin Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Raw tin nugget panned from water tiles.',
  }),
  nickel_nugget: createResource({
    id: 'nickel_nugget',
    name: 'Nickel Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Raw nickel nugget panned from water tiles.',
  }),
  silver_nugget: createResource({
    id: 'silver_nugget',
    name: 'Silver Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Raw silver nugget panned from water tiles.',
  }),
  gold_nugget: createResource({
    id: 'gold_nugget',
    name: 'Gold Nugget',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Raw gold nugget panned from water tiles.',
  }),
  gems_nugget: createResource({
    id: 'gems_nugget',
    name: 'Uncut Gem Fragment',
    category: 'ore_nugget',
    sizeClass: 2,
    description: 'Rare rough crystal panned from riverbanks.',
  }),

  // Copper Age evolution milestone item
  copper_ingot: createResource({
    id: 'copper_ingot',
    name: 'Copper Ingot',
    category: 'ingot',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Refined copper ingot; crafting the first unlocks the Copper Age.',
  }),
});

/** Ordered array of resource IDs eligible to drop as panned nuggets. */
export const PANNABLE_ORE_NUGGETS = Object.freeze(
  PANNABLE_ORE_IDS.map((oreId) => `${oreId}_nugget`),
);

/**
 * Starter inventory stored inside pooled village storage at spawn:
 * 10 sticks (20) + 10 pelts (20) + 5 small_stones (10) + 5 berries (10) = 60 / 250 bulk capacity.
 */
export const STARTER_INVENTORY = Object.freeze({
  sticks: 10,
  pelts: 10,
  small_stones: 5,
  berries: 5,
});

/** Starter Main village pools at spawn (before any units are trained). */
export const STARTER_VILLAGE_POOLS = Object.freeze({
  mainTier: 1,
  mainLevel: 1,
  storageCapacity: 250,
  basePopCapacity: 10,
  water: 5,
  waterCapacity: 10,
});
