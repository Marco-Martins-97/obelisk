/**
 * Universal data-driven Building templates (Stone Age Tier 1 roster).
 *
 * Player villages store dynamic `{ buildingId, x, y, level, status, completedAtMs }`
 * instances rather than duplicating static metadata.
 */

/**
 * Normalizes a building template definition with strict default values.
 *
 * @param {object} config - Building configuration fields.
 * @param {string} config.id - Unique snake_case building identifier.
 * @param {string} config.name - Human-readable building name.
 * @param {number} [config.tier=1] - Base technology tier (`MAIN` tier sets village Age).
 * @param {number} [config.maxLevel=3] - Maximum upgrade level within its tier.
 * @param {number} [config.maxTier=3] - Maximum upgradeable Tier supported for this building.
 * @param {string} [config.age='stone'] - Tech age introducing this building.
 * @param {boolean} [config.prePlaced=false] - Whether placed automatically at spawn.
 * @param {boolean} [config.buildable=true] - Whether constructible from the tile Build menu.
 * @param {number | null} [config.maxCount=null] - Per-territory limit (null = unlimited).
 * @param {number} [config.workersRequired=0] - Permanent workers employed (`popUsed`) once active.
 * @param {number} [config.buildersRequired=1] - Builders locked during round-trip construction.
 * @param {number} [config.buildTimeHours=1] - On-site construction time in in-game hours.
 * @param {Record<string, number>} [config.cost={}] - Resource costs consumed when starting build.
 * @param {string[]} [config.requiredTechs=[]] - Technology IDs required to build/upgrade.
 * @param {string[]} [config.researchesTechs=[]] - Technology IDs researchable inside this building.
 * @param {Record<number, object>} [config.tierUpgrades={}] - Per-tier upgrade rules (used by Main).
 * @param {number} [config.storageBonusPerLevel=0] - General bulk storage capacity added per level.
 * @param {Record<number, number> | null} [config.storageTierBases=null] - Tier base values for fractional storage scaling.
 * @param {number} [config.preservedStorageBonusPerLevel=0] - Preserved food bulk capacity added per level (Granary).
 * @param {Record<number, number> | null} [config.preservedStorageTierBases=null] - Tier base values for preserved storage.
 * @param {number} [config.spoilageMultiplier=1] - Spoilage multiplier (e.g., 0.4 = -60%) inside preserved storage.
 * @param {number} [config.popBonusPerLevel=0] - Max population slots added per level.
 * @param {Record<number, number> | null} [config.popTierBases=null] - Tier base values for fractional population scaling.
 * @param {number} [config.waterCapacity=0] - Dedicated base water storage capacity in bowls.
 * @param {number[] | null} [config.waterCapacityByLevel=null] - Explicit per-level water bowl totals (Tier 1 Main override).
 * @param {Record<number, number> | null} [config.waterTierBases=null] - Tier base values for fractional water capacity.
 * @param {Record<number, number> | null} [config.productionTierBases=null] - Tier base daily output rate (`items / in-game day`).
 * @param {Record<number, number> | null} [config.attachmentTierBases=null] - Tier base Farm attachment limit.
 * @param {Record<number, number> | null} [config.penCapacityTierBases=null] - Tier base Animal Pen livestock capacity.
 * @param {Record<number, number> | null} [config.defenseTierBases=null] - Tier base Wall defense & degradation reduction %.
 * @param {'any_land' | 'forest_only' | 'near_water' | 'adjacent_to_farm' | 'main_internal'} [config.placementRule='any_land'] - Spatial placement restriction.
 * @param {string | null} [config.producesResource=null] - Output resource ID produced passively per day.
 * @param {'ore' | 'forest' | 'clay' | 'stone' | null} [config.depositKey=null] - Tile deposit field depleted by production.
 * @param {number | null} [config.baseDepositAmount=null] - Base deposit units before density scaling.
 * @param {string[]} [config.trainsUnits=[]] - Unit IDs trainable inside this building.
 * @param {string[]} [config.craftsRecipes=[]] - Recipe IDs craftable inside this building.
 * @param {string} [config.description=''] - Short summary shown in UI tooltips.
 * @returns {Readonly<object>} Immutable building template.
 * @throws {Error} When required identifiers are missing or counts are invalid.
 */
export function createBuilding(config) {
  if (!config?.id || !config?.name) {
    throw new Error('Building template requires non-empty id and name.');
  }

  const maxLevel = config.maxLevel ?? 3;
  const workersRequired = config.workersRequired ?? 0;
  const buildersRequired = config.buildersRequired ?? 1;
  const buildTimeHours = config.buildTimeHours ?? 1;
  const preservedStorageBonusPerLevel = config.preservedStorageBonusPerLevel ?? 0;
  const spoilageMultiplier = config.spoilageMultiplier ?? 1;

  if (!Number.isInteger(maxLevel) || maxLevel < 1) {
    throw new RangeError(`Building "${config.id}" maxLevel must be >= 1.`);
  }
  if (!Number.isInteger(workersRequired) || workersRequired < 0) {
    throw new RangeError(`Building "${config.id}" workersRequired must be >= 0.`);
  }
  if (!Number.isInteger(buildersRequired) || buildersRequired < 0) {
    throw new RangeError(`Building "${config.id}" buildersRequired must be >= 0.`);
  }
  if (!Number.isFinite(buildTimeHours) || buildTimeHours < 0) {
    throw new RangeError(`Building "${config.id}" buildTimeHours must be >= 0.`);
  }
  if (!Number.isFinite(preservedStorageBonusPerLevel) || preservedStorageBonusPerLevel < 0) {
    throw new RangeError(`Building "${config.id}" preservedStorageBonusPerLevel must be >= 0.`);
  }
  if (!Number.isFinite(spoilageMultiplier) || spoilageMultiplier < 0 || spoilageMultiplier > 1) {
    throw new RangeError(`Building "${config.id}" spoilageMultiplier must be within 0..1.`);
  }

  const normalizedTierUpgrades = Object.fromEntries(
    Object.entries(config.tierUpgrades ?? {}).map(([targetTier, upgrade]) => [
      targetTier,
      Object.freeze({
        ...upgrade,
        requiredTechs: Object.freeze([...(upgrade.requiredTechs ?? [])]),
        cost: Object.freeze({ ...(upgrade.cost ?? {}) }),
      }),
    ]),
  );

  return Object.freeze({
    id: config.id,
    name: config.name,
    age: config.age ?? 'stone',
    tier: config.tier ?? 1,
    maxLevel,
    maxTier: config.maxTier ?? 3,
    prePlaced: Boolean(config.prePlaced),
    buildable: config.buildable ?? true,
    maxCount: config.maxCount ?? null,
    workersRequired,
    buildersRequired,
    buildTimeHours,
    cost: Object.freeze({ ...(config.cost ?? {}) }),
    requiredTechs: Object.freeze([...(config.requiredTechs ?? [])]),
    researchesTechs: Object.freeze([...(config.researchesTechs ?? [])]),
    tierUpgrades: Object.freeze(normalizedTierUpgrades),
    storageBonusPerLevel: config.storageBonusPerLevel ?? 0,
    storageTierBases: config.storageTierBases ? Object.freeze({ ...config.storageTierBases }) : null,
    preservedStorageBonusPerLevel,
    preservedStorageTierBases: config.preservedStorageTierBases
      ? Object.freeze({ ...config.preservedStorageTierBases })
      : null,
    spoilageMultiplier,
    popBonusPerLevel: config.popBonusPerLevel ?? 0,
    popTierBases: config.popTierBases ? Object.freeze({ ...config.popTierBases }) : null,
    waterCapacity: config.waterCapacity ?? 0,
    waterCapacityByLevel: Array.isArray(config.waterCapacityByLevel)
      ? Object.freeze([...config.waterCapacityByLevel])
      : null,
    waterTierBases: config.waterTierBases ? Object.freeze({ ...config.waterTierBases }) : null,
    productionTierBases: config.productionTierBases
      ? Object.freeze({ ...config.productionTierBases })
      : null,
    attachmentTierBases: config.attachmentTierBases
      ? Object.freeze({ ...config.attachmentTierBases })
      : null,
    penCapacityTierBases: config.penCapacityTierBases
      ? Object.freeze({ ...config.penCapacityTierBases })
      : null,
    defenseTierBases: config.defenseTierBases ? Object.freeze({ ...config.defenseTierBases }) : null,
    placementRule: config.placementRule ?? 'any_land',
    producesResource: config.producesResource ?? null,
    depositKey: config.depositKey ?? null,
    baseDepositAmount: config.baseDepositAmount ?? null,
    trainsUnits: Object.freeze([...(config.trainsUnits ?? [])]),
    craftsRecipes: Object.freeze([...(config.craftsRecipes ?? [])]),
    description: config.description ?? '',
  });
}

/** Stone Age building registry (balanced against STARTER_INVENTORY). */
export const BUILDINGS = Object.freeze({
  main: createBuilding({
    id: 'main',
    name: 'Main Village Hall',
    prePlaced: true,
    buildable: false,
    maxCount: 1,
    maxLevel: 3,
    maxTier: 4,
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    cost: { sticks: 8, pelts: 5, straw: 5 },
    tierUpgrades: {
      2: {
        targetAge: 'copper',
        requiredTechs: ['copper_age'],
        buildersRequired: 1,
        buildTimeHours: 4.0,
        cost: { small_stones: 8, sticks: 8, straw: 6, pelts: 4, clay: 6 },
      },
      3: {
        targetAge: 'bronze',
        requiredTechs: ['bronze_age'],
        buildersRequired: 1,
        buildTimeHours: 6.0,
        cost: { stone_blocks: 12, wood_logs: 12, clay: 10, copper_ingot: 4 },
      },
      4: {
        targetAge: 'iron',
        requiredTechs: ['iron_age'],
        buildersRequired: 1,
        buildTimeHours: 8.0,
        cost: { stone_blocks: 20, planks: 20, bronze_ingot: 8, iron_ingot: 2 },
      },
    },
    storageBonusPerLevel: 250,
    storageTierBases: { 1: 250, 2: 1000, 3: 5000, 4: 15000 },
    popBonusPerLevel: 10,
    popTierBases: { 1: 10, 2: 40, 3: 130, 4: 350 },
    waterCapacity: 10,
    waterCapacityByLevel: [10, 25, 50],
    waterTierBases: { 1: 10, 2: 75, 3: 250, 4: 600 },
    trainsUnits: ['gatherer', 'hunter', 'builder', 'prospector'],
    description:
      'Central village Age controller scaling storage (250/1000/5000/15000 tier bases), housing, water, Walls, and unit training.',
  }),
  firepit: createBuilding({
    id: 'firepit',
    name: 'Firepit',
    maxTier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    cost: { sticks: 4, small_stones: 3 },
    researchesTechs: ['stone_tools', 'basket_weaving'],
    craftsRecipes: [
      'cook_meat',
      'cook_fish',
      'boil_salt',
      'burn_wood_ash',
      'crush_bone_meal',
      'craft_woven_basket',
    ],
    description: 'Legacy hearth capped at Tier 2; cooks meat/fish, boils salt, burns ash/bone meal, and weaves baskets.',
  }),
  house: createBuilding({
    id: 'house',
    name: 'House',
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    cost: { sticks: 6, pelts: 4, straw: 4 },
    popBonusPerLevel: 10,
    popTierBases: { 1: 10, 2: 40, 3: 130, 4: 350 },
    description: 'Increases maximum village population (scales by Tier & Level).',
  }),
  warehouse: createBuilding({
    id: 'warehouse',
    name: 'Warehouse',
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    requiredTechs: [],
    cost: { sticks: 8, pelts: 4, straw: 6 },
    storageBonusPerLevel: 250,
    storageTierBases: { 1: 250, 2: 1000, 3: 5000, 4: 15000 },
    description: 'Expands pooled village bulk storage (scales by Tier & Level).',
  }),
  drying_rack: createBuilding({
    id: 'drying_rack',
    name: 'Drying Rack',
    maxTier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    requiredTechs: ['stone_tools'],
    cost: { sticks: 5, pelts: 2, straw: 2 },
    craftsRecipes: ['dry_meat', 'dry_fish', 'salt_meat', 'salt_fish'],
    description: 'Legacy curing rack capped at Tier 2; air-dries or salt-cures meat and fish.',
  }),
  kiln: createBuilding({
    id: 'kiln',
    name: 'Clay Kiln',
    maxTier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['stone_tools'],
    cost: { small_stones: 5, clay: 8, straw: 4, sticks: 4 },
    researchesTechs: ['clay_vessels'],
    craftsRecipes: [
      'craft_charcoal',
      'craft_clay_vessel',
      'smelt_copper_ingot',
      'smelt_copper_ore',
      'smelt_bronze_ingot',
      'smelt_bronze_from_ore',
    ],
    description: 'Legacy furnace capped at Tier 2; fires Clay Vessels and smelts Copper & initial Bronze ingots.',
  }),

  // Stage 4: Copper Age buildings (Tier 2 base, upgradeable to Tier 3+ resetting level to 1)
  smithy: createBuilding({
    id: 'smithy',
    name: 'Smithy',
    age: 'copper',
    tier: 2,
    maxTier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    requiredTechs: [],
    cost: { sticks: 8, small_stones: 6, clay: 4, pelts: 2 },
    researchesTechs: [
      'stone_axe',
      'bone_pickaxe',
      'stone_hoe',
      'stone_spear',
      'stone_shovel',
      'stone_hammer',
      'stone_knife',
      'stone_sickle',
      'copper_axe',
      'copper_pickaxe',
      'copper_hoe',
      'copper_spear',
      'copper_shovel',
      'copper_hammer',
      'copper_knife',
      'copper_sickle',
      'copper_saw',
      'wood_bow',
      'copper_sword',
      'wood_shield',
    ],
    description:
      'Legacy Copper Age smithy (max Tier 2) researching Stone/Bone starter tools and Copper upgrades.',
  }),
  timber_camp: createBuilding({
    id: 'timber_camp',
    name: 'Timber Camp',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    requiredTechs: ['stone_axe'],
    placementRule: 'forest_only',
    producesResource: 'wood_logs',
    depositKey: 'forest',
    baseDepositAmount: 25000,
    productionTierBases: { 2: 30, 3: 90 },
    cost: { sticks: 8, small_stones: 4, pelts: 2 },
    description: 'Must be built on a forest tile; fells Wood Logs scaled by forest density until depleted.',
  }),
  mine: createBuilding({
    id: 'mine',
    name: 'Mine Shaft',
    age: 'copper',
    tier: 2,
    workersRequired: 2,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['bone_pickaxe'],
    placementRule: 'any_land',
    producesResource: 'multi_ore',
    depositKey: 'ore',
    baseDepositAmount: 100000,
    productionTierBases: { 2: 40, 3: 120 },
    cost: { sticks: 10, small_stones: 6, pelts: 4 },
    description: 'Extracts all ores hosted in the tile proportionally to each ore layer density (up to 100k per vein).',
  }),
  quarry: createBuilding({
    id: 'quarry',
    name: 'Stone Quarry',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['bone_pickaxe'],
    placementRule: 'any_land',
    producesResource: 'stone_blocks',
    depositKey: 'stone',
    baseDepositAmount: 50000,
    productionTierBases: { 2: 25, 3: 75 },
    cost: { sticks: 8, small_stones: 6, pelts: 3 },
    description: 'Cuts Stone Blocks continuously on any land tile for walls and masonry.',
  }),
  clay_pit: createBuilding({
    id: 'clay_pit',
    name: 'Clay Pit',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    requiredTechs: ['stone_shovel'],
    placementRule: 'near_water',
    producesResource: 'clay',
    depositKey: 'clay',
    baseDepositAmount: 10000,
    productionTierBases: { 2: 24, 3: 72 },
    cost: { sticks: 6, pelts: 3, straw: 4 },
    description: 'Placed adjacent to a water tile; digs Clay from a 10,000-unit riverbank deposit.',
  }),
  well: createBuilding({
    id: 'well',
    name: 'Village Well',
    age: 'copper',
    tier: 2,
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    requiredTechs: ['stone_shovel'],
    placementRule: 'any_land',
    producesResource: 'water',
    productionTierBases: { 2: 30, 3: 90 },
    waterCapacity: 60,
    waterTierBases: { 2: 60, 3: 180 },
    cost: { small_stones: 8, sticks: 6, clay: 4 },
    description: 'Passively draws fresh water bowls per day and expands settlement water reserve.',
  }),
  farm: createBuilding({
    id: 'farm',
    name: 'Farmstead',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['stone_hoe'],
    placementRule: 'any_land',
    storageTierBases: { 2: 128, 3: 384 },
    attachmentTierBases: { 2: 3, 3: 9 },
    cost: { sticks: 10, straw: 8, pelts: 4 },
    description: 'Central agriculture hub storing reserved seeds safely and unlocking adjacent Fields, Pens, and Orchards.',
  }),
  crop_field: createBuilding({
    id: 'crop_field',
    name: 'Crop Field',
    age: 'copper',
    tier: 2,
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 1.0,
    requiredTechs: ['stone_hoe'],
    placementRule: 'adjacent_to_farm',
    cost: { sticks: 4, straw: 4 },
    description: 'Must be adjacent to a Farmstead; 8x8 (64 slots) seasonal field consuming Soil Nutrients A, B, or C.',
  }),
  animal_pen: createBuilding({
    id: 'animal_pen',
    name: 'Animal Pen',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    requiredTechs: ['stone_hoe'],
    placementRule: 'adjacent_to_farm',
    penCapacityTierBases: { 2: 6, 3: 18 },
    cost: { sticks: 8, straw: 6, pelts: 2 },
    description: 'Adjacent to Farmstead; houses captured Horses, Donkeys, Goats, Sheep, and Chickens.',
  }),
  orchard: createBuilding({
    id: 'orchard',
    name: 'Orchard',
    age: 'copper',
    tier: 2,
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 1.0,
    requiredTechs: ['stone_hoe'],
    placementRule: 'adjacent_to_farm',
    cost: { sticks: 6, straw: 4 },
    description: 'Adjacent to Farmstead; 9 tree slots planted with Saplings for annual Summer/Autumn harvests.',
  }),
  granary: createBuilding({
    id: 'granary',
    name: 'Granary',
    age: 'copper',
    tier: 2,
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['stone_hammer'],
    placementRule: 'any_land',
    preservedStorageBonusPerLevel: 500,
    preservedStorageTierBases: { 2: 500, 3: 1500 },
    spoilageMultiplier: 0.4,
    cost: { sticks: 10, clay: 8, straw: 8 },
    description: 'Dedicated preserved food warehouse cutting daily spoilage by -60% on highest-spoil food first.',
  }),
  market: createBuilding({
    id: 'market',
    name: 'Market',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['stone_hammer'],
    placementRule: 'any_land',
    trainsUnits: ['caravan'],
    cost: { sticks: 10, pelts: 6, straw: 6 },
    description: 'Crafts Caravans (1 Donkey + 1 Pop) and swaps village goods at 1:1 trade ratio.',
  }),
  expedition_outpost: createBuilding({
    id: 'expedition_outpost',
    name: 'Expedition Outpost',
    age: 'copper',
    tier: 2,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['stone_hammer'],
    placementRule: 'any_land',
    trainsUnits: ['scout'],
    cost: { sticks: 10, pelts: 6, small_stones: 6 },
    description: 'Trains mounted Scouts (1 Horse + 1 Pop) and dispatches Continent Map expeditions.',
  }),
  wall: createBuilding({
    id: 'wall',
    name: 'City Wall',
    age: 'copper',
    tier: 2,
    maxTier: 3,
    buildable: false,
    maxCount: 1,
    placementRule: 'main_internal',
    requiredTechs: ['stone_spear'],
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    defenseTierBases: { 1: 10, 2: 15, 3: 45, 4: 70 },
    cost: { small_stones: 10, sticks: 8, clay: 6 },
    description: 'Perimeter fortification built inside Main (Wood -> Stone -> Brick); boosts defense and cuts building degradation.',
  }),

  // Stage 5: Bronze Age Workshops, Fortifications, Maritime Port & Barracks
  workshop: createBuilding({
    id: 'workshop',
    name: 'Workshop',
    age: 'copper',
    tier: 2,
    maxTier: 3,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 2.5,
    requiredTechs: ['copper_saw'],
    placementRule: 'any_land',
    cost: { wood_logs: 8, stone_blocks: 4, copper_ingot: 1 },
    researchesTechs: ['leather_working', 'leather_armor', 'saddle'],
    craftsRecipes: [
      'saw_planks',
      'craft_leather',
      'craft_leather_ash',
      'braid_rope_flax',
      'braid_rope_straw',
      'craft_woven_basket',
    ],
    description: 'Cuts Wood Logs into Planks, tans Pelts into Leather, braids Rope, and researches Leather Armor & Saddles.',
  }),
  smokehouse: createBuilding({
    id: 'smokehouse',
    name: 'Smokehouse & Kitchen',
    age: 'bronze',
    tier: 3,
    maxTier: 3,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['copper_knife'],
    placementRule: 'any_land',
    cost: { stone_blocks: 8, clay: 6, wood_logs: 8 },
    researchesTechs: ['basket_weaving'],
    craftsRecipes: [
      'cook_meat',
      'cook_fish',
      'boil_salt',
      'burn_wood_ash',
      'crush_bone_meal',
      'craft_woven_basket',
      'dry_meat',
      'dry_fish',
      'salt_meat',
      'salt_fish',
      'bake_bread',
      'smoke_meat',
      'smoke_fish',
    ],
    description: 'Replaces Firepit & Drying Rack; handles all cooking/curing plus Bread and ultra-durable Smoked Meat/Fish.',
  }),
  forge: createBuilding({
    id: 'forge',
    name: 'Bronze Forge',
    age: 'bronze',
    tier: 3,
    maxTier: 3,
    workersRequired: 2,
    buildersRequired: 1,
    buildTimeHours: 4.0,
    requiredTechs: ['bronze_age', 'copper_hammer'],
    placementRule: 'any_land',
    cost: { stone_blocks: 12, clay: 10, copper_ingot: 2, bronze_ingot: 1 },
    researchesTechs: [
      'stone_axe',
      'bone_pickaxe',
      'stone_hoe',
      'stone_spear',
      'stone_shovel',
      'stone_hammer',
      'stone_knife',
      'stone_sickle',
      'copper_axe',
      'copper_pickaxe',
      'copper_hoe',
      'copper_spear',
      'copper_shovel',
      'copper_hammer',
      'copper_knife',
      'copper_sickle',
      'copper_saw',
      'wood_bow',
      'copper_sword',
      'wood_shield',
      'bronze_axe',
      'bronze_pickaxe',
      'bronze_hoe',
      'bronze_spear',
      'bronze_shovel',
      'bronze_hammer',
      'bronze_knife',
      'bronze_sickle',
      'bronze_saw',
      'composite_bow',
      'bronze_sword',
      'bronze_shield',
      'bronze_armor',
      'clay_vessels',
    ],
    craftsRecipes: [
      'craft_charcoal',
      'craft_clay_vessel',
      'smelt_copper_ingot',
      'smelt_copper_ore',
      'smelt_bronze_ingot',
      'smelt_bronze_from_ore',
    ],
    description: 'Replaces Clay Kiln & Smithy; crafts all ingots/vessels and researches Bronze tools, weapons & armors.',
  }),
  bloomery: createBuilding({
    id: 'bloomery',
    name: 'Bloomery Furnace',
    age: 'bronze',
    tier: 3,
    maxTier: 3,
    workersRequired: 2,
    buildersRequired: 1,
    buildTimeHours: 4.5,
    requiredTechs: ['bronze_pickaxe', 'bronze_hammer'],
    placementRule: 'any_land',
    cost: { stone_blocks: 16, clay: 12, bronze_ingot: 2, charcoal: 4 },
    craftsRecipes: ['smelt_iron_ore', 'smelt_iron_nuggets'],
    description: 'High-draft furnace smelting Iron Ore/Nuggets with Flux and Charcoal to unlock the Iron Age.',
  }),
  watchtower: createBuilding({
    id: 'watchtower',
    name: 'Watchtower',
    age: 'bronze',
    tier: 2,
    maxTier: 3,
    workersRequired: 3,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['stone_spear'],
    placementRule: 'any_land',
    defenseTierBases: { 2: 20, 3: 50, 4: 75 },
    cost: { wood_logs: 8, stone_blocks: 6, planks: 4 },
    description: 'High-garrison tower (3 Pop) projecting a 3x3 aura of defense & degradation protection (highest value prevails).',
  }),
  port: createBuilding({
    id: 'port',
    name: 'Port',
    age: 'bronze',
    tier: 3,
    maxTier: 3,
    workersRequired: 2,
    buildersRequired: 1,
    buildTimeHours: 4.0,
    requiredTechs: ['bronze_saw'],
    placementRule: 'near_water',
    producesResource: 'fish',
    productionTierBases: { 3: 15, 4: 40 },
    cost: { planks: 12, rope: 4, stone_blocks: 8, bronze_ingot: 2 },
    trainsUnits: ['fishing_boat', 'transport_ship'],
    description: 'Coastal/river dockyard fishing continuously and constructing Fishing Boats & Transport Ships.',
  }),
  barracks: createBuilding({
    id: 'barracks',
    name: 'Barracks',
    age: 'bronze',
    tier: 2,
    maxTier: 3,
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['stone_spear'],
    placementRule: 'any_land',
    cost: { wood_logs: 10, stone_blocks: 8, pelts: 4 },
    trainsUnits: ['spearman', 'swordsman', 'archer', 'cavalry'],
    description: 'Trains military escorts & garrisons using researched weapon/armor techs and handles Bronze batch refits.',
  }),
});

/** Ordered array of all Stone Age buildings. */
export const BUILDING_LIST = Object.freeze(Object.values(BUILDINGS));
