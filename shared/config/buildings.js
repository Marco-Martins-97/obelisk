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
 * @param {number} [config.storageBonusPerLevel=0] - Bulk storage capacity added per level.
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
    cost: { sticks: 6, small_stones: 5, pelts: 4 },
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
    description: 'Central village Age controller holding starter supplies, water jar, and unit training.',
  }),
  firepit: createBuilding({
    id: 'firepit',
    name: 'Firepit',
    workersRequired: 1,
    buildersRequired: 1,
    buildTimeHours: 1.5,
    cost: { sticks: 4, small_stones: 3 },
    researchesTechs: ['stone_tools'],
    craftsRecipes: ['cook_meat', 'cook_fish'],
    description: 'Cooks meat and fish and researches Stone Tools technology.',
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
