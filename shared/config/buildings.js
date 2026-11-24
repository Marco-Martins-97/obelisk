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
 * @param {number} [config.preservedStorageBonusPerLevel=0] - Preserved food bulk capacity added per level (future Granary/Root Cellar).
 * @param {number} [config.spoilageMultiplier=1] - Spoilage multiplier (e.g., 0.4 = -60%) inside preserved storage.
 * @param {number} [config.popBonusPerLevel=0] - Max population slots added per level.
 * @param {number} [config.waterCapacity=0] - Dedicated water storage capacity in bowls.
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
    preservedStorageBonusPerLevel,
    spoilageMultiplier,
    popBonusPerLevel: config.popBonusPerLevel ?? 0,
    waterCapacity: config.waterCapacity ?? 0,
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
    },
    storageBonusPerLevel: 250,
    popBonusPerLevel: 10,
    waterCapacity: 10,
    trainsUnits: ['gatherer', 'hunter', 'builder'],
    description:
      'Central village Age controller scaling storage (+250/lv), housing (+10/lv), water (+10 bowls/lv), and unit training.',
  }),
  firepit: createBuilding({
    id: 'firepit',
    name: 'Firepit',
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    cost: { sticks: 4, small_stones: 3 },
    researchesTechs: ['stone_tools'],
    craftsRecipes: ['cook_meat', 'cook_fish', 'boil_salt'],
    description: 'Cooks meat/fish, boils water into salt, and researches Stone Tools.',
  }),
  house: createBuilding({
    id: 'house',
    name: 'House',
    workersRequired: 0,
    buildersRequired: 1,
    buildTimeHours: 2.0,
    cost: { sticks: 6, pelts: 4, straw: 4 },
    popBonusPerLevel: 10,
    description: 'Increases maximum village population by +10 per level (max Lv 3).',
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
    description: 'Expands pooled village storage capacity by +250 bulk per level (max Lv 3).',
  }),
  drying_rack: createBuilding({
    id: 'drying_rack',
    name: 'Drying Rack',
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    requiredTechs: ['stone_tools'],
    cost: { sticks: 5, pelts: 2, straw: 2 },
    craftsRecipes: ['dry_meat', 'dry_fish', 'salt_meat', 'salt_fish'],
    description: 'Air-dries or salt-cures meat and fish to sharply reduce daily spoilage.',
  }),
  kiln: createBuilding({
    id: 'kiln',
    name: 'Clay Kiln',
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 3.0,
    requiredTechs: ['stone_tools'],
    cost: { small_stones: 5, clay: 8, straw: 4, sticks: 4 },
    craftsRecipes: ['craft_charcoal', 'smelt_copper_ingot'],
    description: 'Produces charcoal and smelts copper nuggets to unlock the Copper Age.',
  }),
});

/** Ordered array of all Stone Age buildings. */
export const BUILDING_LIST = Object.freeze(Object.values(BUILDINGS));
