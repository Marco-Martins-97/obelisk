/**
 * Data-driven Technology Tree & Age progression definitions.
 *
 * Tools are permanent, player-persistent technologies rather than storage items.
 * Workers automatically apply the highest unlocked tool tier (`getBestUnlockedTool`),
 * and newly claimed villages inherit unlocked technologies from the player's tech state.
 */

/** Ordered progression of Obelisk historical Ages. */
export const AGES = Object.freeze(['stone', 'copper', 'bronze', 'iron', 'steel']);

/** Mapping of age ID -> integer building/village tier (1..5). */
export const AGE_TIERS = Object.freeze({
  stone: 1,
  copper: 2,
  bronze: 3,
  iron: 4,
  steel: 5,
});

/**
 * Normalizes a technology tree node definition with trigger, prerequisites, and modifiers.
 *
 * @param {object} config - Technology node fields.
 * @param {string} config.id - Unique snake_case technology identifier.
 * @param {string} config.name - Human-readable display name.
 * @param {string} [config.age='stone'] - Age introducing this node.
 * @param {number} [config.tier=1] - Tier within the tool/age ladder.
 * @param {'tool' | 'age'} [config.category='tool'] - Node classification.
 * @param {string | null} [config.toolType='general'] - Specialization ('general' in Stone Age, split later).
 * @param {string | null} [config.researchedAt=null] - Building ID where research runs (null if starter/automatic).
 * @param {string[]} [config.prerequisites=[]] - Prerequisite tech IDs required before research.
 * @param {object} [config.unlockTrigger={ type: 'starter' }] - Gameplay event unlocking this branch.
 * @param {Record<string, number>} [config.cost={}] - Materials consumed to research this node.
 * @param {number} [config.researchTimeHours=0] - Research duration in in-game hours.
 * @param {object} [config.modifiers] - Gameplay bonuses granted once unlocked.
 * @param {string[]} [config.unlocksBuildings=[]] - Building IDs unlocked by this technology.
 * @param {number | null} [config.unlocksMainTier=null] - Main Age tier unlocked (for age nodes).
 * @param {string} [config.description=''] - Short tooltip summary.
 * @returns {Readonly<object>} Immutable normalized technology template.
 * @throws {Error} When required identifiers, age, tier, or durations are invalid.
 */
export function createTechnology(config) {
  if (!config?.id || !config?.name) {
    throw new Error('Technology template requires non-empty id and name.');
  }

  const age = config.age ?? 'stone';
  if (!AGE_TIERS[age]) {
    throw new Error(`Technology "${config.id}" has invalid age "${age}".`);
  }

  const tier = config.tier ?? 1;
  if (!Number.isInteger(tier) || tier < 1) {
    throw new RangeError(`Technology "${config.id}" tier must be an integer >= 1.`);
  }

  const researchTimeHours = config.researchTimeHours ?? 0;
  if (!Number.isFinite(researchTimeHours) || researchTimeHours < 0) {
    throw new RangeError(`Technology "${config.id}" researchTimeHours must be >= 0.`);
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    age,
    tier,
    category: config.category ?? 'tool',
    toolType: config.toolType !== undefined ? config.toolType : 'general',
    researchedAt: config.researchedAt ?? null,
    prerequisites: Object.freeze([...(config.prerequisites ?? [])]),
    unlockTrigger: Object.freeze({ ...(config.unlockTrigger ?? { type: 'starter' }) }),
    cost: Object.freeze({ ...(config.cost ?? {}) }),
    researchTimeHours,
    modifiers: Object.freeze({
      workSpeedMultiplier: 1.0,
      yieldBonus: 0,
      nothingWeightMultiplier: 1.0,
      ...(config.modifiers ?? {}),
    }),
    unlocksBuildings: Object.freeze([...(config.unlocksBuildings ?? [])]),
    unlocksMainTier: config.unlocksMainTier ?? null,
    description: config.description ?? '',
  });
}

/** Stone Age technology tree and the Copper Age transition trigger. */
export const TECHNOLOGIES = Object.freeze({
  wood_tools: createTechnology({
    id: 'wood_tools',
    name: 'Wood Tools',
    age: 'stone',
    tier: 1,
    category: 'tool',
    toolType: 'general',
    researchedAt: null,
    prerequisites: [],
    unlockTrigger: { type: 'starter' },
    cost: {},
    researchTimeHours: 0,
    modifiers: {
      workSpeedMultiplier: 1.0,
      yieldBonus: 0,
      nothingWeightMultiplier: 1.0,
    },
    description: 'Baseline Stone Age wooden implements unlocked automatically at spawn.',
  }),
  stone_tools: createTechnology({
    id: 'stone_tools',
    name: 'Stone Tools',
    age: 'stone',
    tier: 2,
    category: 'tool',
    toolType: 'general',
    researchedAt: 'firepit',
    prerequisites: ['wood_tools'],
    unlockTrigger: { type: 'build', buildingId: 'firepit', count: 1 },
    cost: { small_stones: 3, sticks: 2 },
    researchTimeHours: 1.0,
    modifiers: {
      workSpeedMultiplier: 1.2,
      yieldBonus: 1,
      nothingWeightMultiplier: 0.5,
    },
    unlocksBuildings: ['kiln'],
    description: 'Knapped stone implements: +20% work speed, +1 max loot, halves empty rolls, and unlocks Clay Kilns.',
  }),
  copper_age: createTechnology({
    id: 'copper_age',
    name: 'Copper Age',
    age: 'copper',
    tier: 2,
    category: 'age',
    toolType: null,
    researchedAt: 'main',
    prerequisites: ['stone_tools'],
    unlockTrigger: { type: 'craft', itemId: 'copper_ingot', count: 1 },
    cost: {},
    researchTimeHours: 0,
    unlocksMainTier: 2,
    description: 'Triggered upon smelting 1 Copper Ingot; unlocks upgrading Main to Tier 2 (Copper Age).',
  }),
});

/** Ordered array of all registered technologies. */
export const TECHNOLOGY_LIST = Object.freeze(Object.values(TECHNOLOGIES));

/** Default technologies unlocked on every newly created player account / starter village. */
export const STARTER_UNLOCKED_TECHS = Object.freeze(['wood_tools']);
