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
 * @param {'starter' | 'passive' | 'research'} [config.researchMode] - Explicit unlock classification (`passive` for empty-cost trigger unlocks).
 * @param {string | null} [config.unlocksRecipe=null] - Recipe ID unlocked immediately when researched (`[Research] -> [Craft]`).
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
    researchMode:
      config.researchMode ?? (Object.keys(config.cost ?? {}).length === 0 ? 'passive' : 'research'),
    unlocksRecipe: config.unlocksRecipe ?? null,
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
  basket_weaving: createTechnology({
    id: 'basket_weaving',
    name: 'Woven Baskets',
    age: 'stone',
    tier: 1,
    category: 'tool',
    toolType: 'container',
    researchedAt: 'firepit',
    researchMode: 'research',
    unlocksRecipe: 'craft_woven_basket',
    prerequisites: ['wood_tools'],
    unlockTrigger: { type: 'build', buildingId: 'firepit', count: 1 },
    cost: { sticks: 4, straw: 3 },
    researchTimeHours: 0.8,
    modifiers: {
      workSpeedMultiplier: 1.05,
      yieldBonus: 1,
      nothingWeightMultiplier: 0.9,
    },
    description: 'Transforms Firepit Weaving into Craft Woven Basket (+15 general storage bulk each).',
  }),
  clay_vessels: createTechnology({
    id: 'clay_vessels',
    name: 'Clay Vessels',
    age: 'stone',
    tier: 2,
    category: 'tool',
    toolType: 'pottery',
    researchedAt: 'kiln',
    researchMode: 'research',
    unlocksRecipe: 'craft_clay_vessel',
    prerequisites: ['stone_tools'],
    unlockTrigger: { type: 'build', buildingId: 'kiln', count: 1 },
    cost: { clay: 4, sticks: 2 },
    researchTimeHours: 1.0,
    description: 'Unlocks firing Clay Vessels at Kiln (+10 water bowls & +20 preserved food cap each).',
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
    unlocksBuildings: ['smithy'],
    description: 'Triggered upon smelting 1 Copper Ingot; unlocks upgrading Main to Tier 2 (Copper Age).',
  }),

  // Stage 4: Copper Age specialized tools (researched at Smithy: Stone/Bone starter -> Copper upgrade)
  stone_axe: createTechnology({
    id: 'stone_axe',
    name: 'Stone Axe',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'axe',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { small_stones: 4, sticks: 3 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 1.0 },
    unlocksBuildings: ['timber_camp'],
    description: 'Chipped stone logging axe; unlocks Timber Camps.',
  }),
  copper_axe: createTechnology({
    id: 'copper_axe',
    name: 'Copper Axe',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'axe',
    researchedAt: 'smithy',
    prerequisites: ['stone_axe'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.8 },
    description: 'Cast copper axe boosting Timber Camp logging output by +35%.',
  }),
  bone_pickaxe: createTechnology({
    id: 'bone_pickaxe',
    name: 'Bone Pickaxe',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'pickaxe',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { bones: 2, sticks: 3 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 1.0 },
    unlocksBuildings: ['mine', 'quarry'],
    description: 'Hafted hunting bone pickaxe; unlocks Mines, Quarries, and Prospectors even without local copper.',
  }),
  copper_pickaxe: createTechnology({
    id: 'copper_pickaxe',
    name: 'Copper Pickaxe',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'pickaxe',
    researchedAt: 'smithy',
    prerequisites: ['bone_pickaxe'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.8 },
    description: 'Forged copper pickaxe boosting Mine & Quarry extraction by +35%.',
  }),
  stone_hoe: createTechnology({
    id: 'stone_hoe',
    name: 'Stone Hoe',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'hoe',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { small_stones: 3, sticks: 3 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 1.0 },
    unlocksBuildings: ['farm', 'crop_field', 'animal_pen', 'orchard'],
    description: 'Stone tillage blade; unlocks Farms, Crop Fields, Animal Pens, and Orchards.',
  }),
  copper_hoe: createTechnology({
    id: 'copper_hoe',
    name: 'Copper Hoe',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'hoe',
    researchedAt: 'smithy',
    prerequisites: ['stone_hoe'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.8 },
    description: 'Copper agricultural hoe boosting Farm harvest yield and field efficiency.',
  }),
  stone_spear: createTechnology({
    id: 'stone_spear',
    name: 'Stone Spear',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'spear',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { small_stones: 4, sticks: 4 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 0.9 },
    unlocksBuildings: ['wall'],
    description: 'Flaked hunting spear enabling Hunters to capture live animals for Animal Pens and unlocking City Walls.',
  }),
  copper_spear: createTechnology({
    id: 'copper_spear',
    name: 'Copper Spear',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'spear',
    researchedAt: 'smithy',
    prerequisites: ['stone_spear'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.7 },
    description: 'Copper-tipped spear improving hunting yield and live animal capture rate.',
  }),
  stone_shovel: createTechnology({
    id: 'stone_shovel',
    name: 'Stone Shovel',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'shovel',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { small_stones: 3, sticks: 3 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 1.0 },
    unlocksBuildings: ['clay_pit', 'well'],
    description: 'Broad stone spade; unlocks riverbank Clay Pits and village Wells.',
  }),
  copper_shovel: createTechnology({
    id: 'copper_shovel',
    name: 'Copper Shovel',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'shovel',
    researchedAt: 'smithy',
    prerequisites: ['stone_shovel'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.8 },
    description: 'Copper spade increasing Clay Pit and Well output by +35%.',
  }),
  stone_hammer: createTechnology({
    id: 'stone_hammer',
    name: 'Stone Hammer',
    age: 'copper',
    tier: 2,
    category: 'tool',
    toolType: 'hammer',
    researchedAt: 'smithy',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { small_stones: 4, sticks: 3 },
    researchTimeHours: 1.0,
    modifiers: { workSpeedMultiplier: 1.1, yieldBonus: 0, nothingWeightMultiplier: 1.0 },
    unlocksBuildings: ['granary', 'market', 'expedition_outpost'],
    description: 'Heavy maul unlocking Granaries, Markets, Expedition Outposts, and structural masonry.',
  }),
  copper_hammer: createTechnology({
    id: 'copper_hammer',
    name: 'Copper Hammer',
    age: 'copper',
    tier: 3,
    category: 'tool',
    toolType: 'hammer',
    researchedAt: 'smithy',
    prerequisites: ['stone_hammer'],
    unlockTrigger: { type: 'build', buildingId: 'smithy', count: 1 },
    cost: { copper_ingot: 1, sticks: 2 },
    researchTimeHours: 1.5,
    modifiers: { workSpeedMultiplier: 1.35, yieldBonus: 1, nothingWeightMultiplier: 0.8 },
    description: 'Heavy forged hammer speeding up building upgrades and Tier advancements.',
  }),
  bronze_age: createTechnology({
    id: 'bronze_age',
    name: 'Bronze Age',
    age: 'bronze',
    tier: 3,
    category: 'age',
    toolType: null,
    researchedAt: 'main',
    prerequisites: ['copper_age'],
    unlockTrigger: { type: 'craft', itemId: 'bronze_ingot', count: 1 },
    cost: {},
    researchTimeHours: 0,
    unlocksMainTier: 3,
    description: 'Triggered upon smelting 1 Bronze Ingot in the Kiln; unlocks upgrading Main to Tier 3 (Bronze Age).',
  }),
});

/** Ordered array of all registered technologies. */
export const TECHNOLOGY_LIST = Object.freeze(Object.values(TECHNOLOGIES));

/** Default technologies unlocked on every newly created player account / starter village. */
export const STARTER_UNLOCKED_TECHS = Object.freeze(['wood_tools']);
