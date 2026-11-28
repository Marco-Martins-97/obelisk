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
  roots: createResource({
    id: 'roots',
    name: 'Wild Roots',
    category: 'food',
    sizeClass: 2,
    edible: true,
    foodValue: 1,
    spoilRatePerDay: 0.08,
    description: 'Edible wild tubers gathered in fields; sustains villagers or replants root crops.',
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
  bone_meal: createResource({
    id: 'bone_meal',
    name: 'Bone Meal',
    category: 'material',
    sizeClass: 1,
    description: 'Crushed animal bones restoring Phosphorus (P) nutrient levels in Crop Fields.',
  }),
  wood_ash: createResource({
    id: 'wood_ash',
    name: 'Wood Ash',
    category: 'material',
    sizeClass: 1,
    description: 'Kiln/Firepit ash restoring Potassium (K) nutrient levels in Crop Fields.',
  }),
  woven_basket: createResource({
    id: 'woven_basket',
    name: 'Woven Basket',
    category: 'material',
    sizeClass: 2,
    description: 'Woven stick-and-straw container expanding pooled village bulk storage by +15 per basket.',
  }),
  clay_vessel: createResource({
    id: 'clay_vessel',
    name: 'Clay Vessel',
    category: 'material',
    age: 'stone',
    tier: 1,
    sizeClass: 2,
    description: 'Fired pottery jar adding +10 water bowl storage and +20 preserved food capacity.',
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

  // Copper Age evolution milestone item & Copper/Bronze production materials
  copper_ingot: createResource({
    id: 'copper_ingot',
    name: 'Copper Ingot',
    category: 'ingot',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Refined copper ingot; crafting the first unlocks the Copper Age.',
  }),
  bronze_ingot: createResource({
    id: 'bronze_ingot',
    name: 'Bronze Ingot',
    category: 'ingot',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    description: 'Alloyed copper and tin ingot; smelting the first unlocks the Bronze Age.',
  }),
  iron_ingot: createResource({
    id: 'iron_ingot',
    name: 'Iron Ingot',
    category: 'ingot',
    age: 'iron',
    tier: 4,
    sizeClass: 2,
    description: 'Smelted wrought iron bar from a Bloomery; unlocks the Iron Age.',
  }),
  steel_ingot: createResource({
    id: 'steel_ingot',
    name: 'Steel Ingot',
    category: 'ingot',
    age: 'steel',
    tier: 5,
    sizeClass: 2,
    description: 'Carburized steel bar smelted inside a Blast Furnace; unlocks the Steel Age.',
  }),
  flax: createResource({
    id: 'flax',
    name: 'Flax Fibers',
    category: 'material',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Retted plant fibers harvested from Flax fields to braid strong rope.',
  }),
  leather: createResource({
    id: 'leather',
    name: 'Leather',
    category: 'material',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Tanned animal hide processed from Pelts at a Workshop for saddles, armor, and gear.',
  }),
  planks: createResource({
    id: 'planks',
    name: 'Planks',
    category: 'material',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    burnTimeSec: 120,
    description: 'Sawn lumber boards crafted at a Workshop for shields, ships, bows, and Tier 3 buildings.',
  }),
  rope: createResource({
    id: 'rope',
    name: 'Rope',
    category: 'material',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    description: 'Braided cordage crafted from Flax Fibers or Straw for Ports, ships, and composite bows.',
  }),
  bread: createResource({
    id: 'bread',
    name: 'Bread',
    category: 'food',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    edible: true,
    foodValue: 4,
    spoilRatePerDay: 0.02,
    description: 'Baked grain loaves from a Smokehouse providing filling, low-spoilage rations.',
  }),
  smoked_meat: createResource({
    id: 'smoked_meat',
    name: 'Smoked Meat',
    category: 'food',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    edible: true,
    foodValue: 5,
    spoilRatePerDay: 0.005,
    description: 'Slow-smoked meat with ultra-low spoilage (0.5%/day) for long expeditions.',
  }),
  smoked_fish: createResource({
    id: 'smoked_fish',
    name: 'Smoked Fish',
    category: 'food',
    age: 'bronze',
    tier: 3,
    sizeClass: 2,
    edible: true,
    foodValue: 4,
    spoilRatePerDay: 0.005,
    description: 'Slow-smoked fish with ultra-low spoilage (0.5%/day) for long voyages.',
  }),
  bones: createResource({
    id: 'bones',
    name: 'Bones',
    age: 'stone',
    tier: 1,
    sizeClass: 2,
    description: 'Animal bones salvaged from hunting; shaped into early Bone Pickaxes.',
  }),
  wood_logs: createResource({
    id: 'wood_logs',
    name: 'Wood Logs',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    burnTimeSec: 180,
    description: 'Heavy timber felled by Timber Camps for mines, construction, and fuel.',
  }),
  stone_blocks: createResource({
    id: 'stone_blocks',
    name: 'Stone Blocks',
    age: 'copper',
    tier: 2,
    sizeClass: 4,
    description: 'Quarried cut rock used for fortified walls and advanced workshops.',
  }),
  sapling: createResource({
    id: 'sapling',
    name: 'Tree Sapling',
    age: 'stone',
    tier: 1,
    sizeClass: 2,
    description: 'Young forest tree shoot planted in Orchards.',
  }),
  manure: createResource({
    id: 'manure',
    name: 'Manure Fertilizer',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Animal pen fertilizer used to restore Crop Field soil nutrients A, B, and C.',
  }),
  wool: createResource({
    id: 'wool',
    name: 'Wool',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Sheared fleece produced daily by Sheep in Animal Pens.',
  }),
  milk: createResource({
    id: 'milk',
    name: 'Milk',
    category: 'food',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.3,
    description: 'Fresh goat milk produced daily; nutritious but spoils rapidly.',
  }),
  eggs: createResource({
    id: 'eggs',
    name: 'Eggs',
    category: 'food',
    age: 'copper',
    tier: 2,
    sizeClass: 1,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.15,
    description: 'Fresh eggs collected daily from Chickens in Animal Pens.',
  }),
  apples: createResource({
    id: 'apples',
    name: 'Apples',
    category: 'food',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.12,
    description: 'Orchard fruit harvested annually during Summer and Autumn.',
  }),
  vegetables: createResource({
    id: 'vegetables',
    name: 'Root Vegetables',
    category: 'food',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    edible: true,
    foodValue: 2,
    spoilRatePerDay: 0.1,
    description: 'Cultivated root crops grown on Nutrient C Crop Fields.',
  }),

  // Raw underground ores mined at Mine shafts
  copper_ore: createResource({
    id: 'copper_ore',
    name: 'Copper Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Deep vein copper ore extracted by a Mine.',
  }),
  tin_ore: createResource({
    id: 'tin_ore',
    name: 'Tin Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Deep vein tin ore needed for Bronze alloying.',
  }),
  iron_ore: createResource({
    id: 'iron_ore',
    name: 'Iron Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Dense iron ore extracted from iron-bearing stone veins.',
  }),
  nickel_ore: createResource({
    id: 'nickel_ore',
    name: 'Nickel Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Trace nickel ore mined in gabbro rock.',
  }),
  silver_ore: createResource({
    id: 'silver_ore',
    name: 'Silver Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Precious silver ore extracted from granite and slate veins.',
  }),
  gold_ore: createResource({
    id: 'gold_ore',
    name: 'Gold Ore',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    description: 'Rare gold ore extracted from deep mineral veins.',
  }),
  coal: createResource({
    id: 'coal',
    name: 'Coal',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 3,
    burnTimeSec: 420,
    description: 'High-heat mined coal used for industrial smelting.',
  }),
  flux: createResource({
    id: 'flux',
    name: 'Flux',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Carbonate mineral flux harvested from limestone and marble veins.',
  }),
  gems: createResource({
    id: 'gems',
    name: 'Uncut Gems',
    category: 'ore',
    age: 'copper',
    tier: 2,
    sizeClass: 1,
    description: 'Precious crystal deposit mined from rare marble pockets.',
  }),

  // Livestock stock items (tracked in Animal Pens & logs)
  horse: createResource({
    id: 'horse',
    name: 'Horse',
    category: 'livestock',
    age: 'copper',
    tier: 2,
    sizeClass: 5,
    description: 'Captured wild horse used to mount Scouts.',
  }),
  donkey: createResource({
    id: 'donkey',
    name: 'Donkey',
    category: 'livestock',
    age: 'copper',
    tier: 2,
    sizeClass: 5,
    description: 'Captured wild donkey used to equip trading Caravans.',
  }),
  goat: createResource({
    id: 'goat',
    name: 'Goat',
    category: 'livestock',
    age: 'copper',
    tier: 2,
    sizeClass: 4,
    description: 'Captured dairy goat kept in Animal Pens.',
  }),
  sheep: createResource({
    id: 'sheep',
    name: 'Sheep',
    category: 'livestock',
    age: 'copper',
    tier: 2,
    sizeClass: 4,
    description: 'Captured fleece sheep kept in Animal Pens.',
  }),
  chicken: createResource({
    id: 'chicken',
    name: 'Chicken',
    category: 'livestock',
    age: 'copper',
    tier: 2,
    sizeClass: 2,
    description: 'Captured egg-laying fowl kept in Animal Pens.',
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

/**
 * Ancient Blueprints discoverable exclusively by exploring Continent Ruins (max 1 of each globally).
 * Unlock Iron-tier advanced technologies and automated Mill buildings.
 */
export const BLUEPRINTS = Object.freeze({
  blueprint_crossbow: Object.freeze({
    id: 'blueprint_crossbow',
    name: 'Crossbow Blueprint',
    unlocksTech: 'crossbow',
    description: 'Ancient torsion-bow schematic enabling Iron Age Crossbow research.',
  }),
  blueprint_windmill: Object.freeze({
    id: 'blueprint_windmill',
    name: 'Windmill Blueprint',
    unlocksBuilding: 'windmill',
    description: 'Geared wind-vane mechanism unlocking automated Windmill construction.',
  }),
  blueprint_watermill: Object.freeze({
    id: 'blueprint_watermill',
    name: 'Watermill Blueprint',
    unlocksBuilding: 'watermill',
    description: 'Paddle-wheel gearwork schematic unlocking automated Watermill construction.',
  }),
});

/** Ordered array of all Ruin Blueprint identifiers. */
export const BLUEPRINT_IDS = Object.freeze(Object.keys(BLUEPRINTS));

/** Material supplies consumed from the home village when founding a new Colony. */
export const COLONY_STARTER_COST = Object.freeze({
  wood_logs: 15,
  stone_blocks: 15,
  planks: 10,
});

/** Starter Copper Age buffer inventory placed inside newly colonized settlements. */
export const COLONY_STARTER_INVENTORY = Object.freeze({
  sticks: 20,
  wood_logs: 15,
  small_stones: 15,
  stone_blocks: 10,
  clay: 10,
  pelts: 10,
  straw: 10,
  copper_ingot: 4,
  bread: 10,
});

/** Starter Copper Age Main Hall pool values for newly colonized settlements. */
export const COLONY_STARTER_POOLS = Object.freeze({
  mainTier: 2,
  mainLevel: 1,
  water: 25,
});
