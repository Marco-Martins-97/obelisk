/**
 * Universal data-driven Unit templates (Stone Age specializations).
 *
 * Units consume `popCost` while active and execute actions asynchronously across a
 * round-trip lifecycle: outbound travel (MAIN -> tile) + work + return travel (tile -> MAIN).
 */

/**
 * Normalizes a unit definition with speed, work duration, and allowed actions.
 *
 * @param {object} config - Unit configuration fields.
 * @param {string} config.id - Unique unit identifier.
 * @param {string} config.name - Display name.
 * @param {number} config.speedKmPerHour - Travel speed in km/h (1 Territory tile = 0.5 km).
 * @param {number} [config.workDurationHours=1] - On-site work duration in in-game hours.
 * @param {number} [config.trainingTimeHours=0] - Training duration at Main in in-game hours.
 * @param {Record<string, number>} [config.trainingCost={}] - Resource costs consumed to train.
 * @param {number} [config.popCost=1] - Population slots occupied by each trained unit.
 * @param {string} [config.age='stone'] - Tech age unlocking this unit.
 * @param {number} [config.tier=1] - Unit tier.
 * @param {string} [config.trainedAt='main'] - Building ID that trains this unit.
 * @param {number} [config.carryCapacity=0] - Dedicated expedition carry capacity in bulk units (Caravan).
 * @param {Record<string, number>} [config.requiredAnimal={}] - Livestock species consumed from pen on training (1 Horse / 1 Donkey).
 * @param {string[]} [config.requiredTechs=[]] - Technology IDs required to unlock training this unit.
 * @param {string[]} [config.upgradeTechs=[]] - Technology IDs unlocking Tier 3 (Bronze) equipment refits.
 * @param {Record<string, number> | null} [config.tier3TrainingCost=null] - Training cost when trained directly at Tier 3.
 * @param {Record<string, number>} [config.refitDeltaCost={}] - Per-unit Bronze refit resource delta cost.
 * @param {number} [config.attack=0] - Base combat attack rating.
 * @param {number} [config.defense=0] - Base combat defense rating.
 * @param {number} [config.tier3Attack=0] - Bronze-refitted combat attack rating.
 * @param {number} [config.tier3Defense=0] - Bronze-refitted combat defense rating.
 * @param {string[]} [config.allowedActions=[]] - Action types executable by this unit.
 * @param {string[]} [config.allowedBiomes=[]] - Territory tile categories targetable by this unit.
 * @param {string} [config.description=''] - Short role description.
 * @returns {Readonly<object>} Immutable unit template.
 * @throws {Error} When required fields are missing or numeric rates are invalid.
 */
export function createUnit(config) {
  if (!config?.id || !config?.name) {
    throw new Error('Unit template requires non-empty id and name.');
  }

  const speedKmPerHour = config.speedKmPerHour ?? 5;
  const workDurationHours = config.workDurationHours ?? 1;
  const trainingTimeHours = config.trainingTimeHours ?? 0;
  const popCost = config.popCost ?? 1;
  const carryCapacity = config.carryCapacity ?? 0;

  if (!Number.isFinite(speedKmPerHour) || speedKmPerHour <= 0) {
    throw new RangeError(`Unit "${config.id}" speedKmPerHour must be > 0.`);
  }
  if (!Number.isFinite(workDurationHours) || workDurationHours < 0) {
    throw new RangeError(`Unit "${config.id}" workDurationHours must be >= 0.`);
  }
  if (!Number.isFinite(trainingTimeHours) || trainingTimeHours < 0) {
    throw new RangeError(`Unit "${config.id}" trainingTimeHours must be >= 0.`);
  }
  if (!Number.isInteger(popCost) || popCost < 1) {
    throw new RangeError(`Unit "${config.id}" popCost must be an integer >= 1.`);
  }
  if (!Number.isFinite(carryCapacity) || carryCapacity < 0) {
    throw new RangeError(`Unit "${config.id}" carryCapacity must be >= 0.`);
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    age: config.age ?? 'stone',
    tier: config.tier ?? 1,
    trainedAt: config.trainedAt ?? 'main',
    popCost,
    speedKmPerHour,
    workDurationHours,
    trainingTimeHours,
    carryCapacity,
    requiredAnimal: Object.freeze({ ...(config.requiredAnimal ?? {}) }),
    trainingCost: Object.freeze({ ...(config.trainingCost ?? {}) }),
    requiredTechs: Object.freeze([...(config.requiredTechs ?? [])]),
    upgradeTechs: Object.freeze([...(config.upgradeTechs ?? [])]),
    tier3TrainingCost: config.tier3TrainingCost
      ? Object.freeze({ ...config.tier3TrainingCost })
      : null,
    refitDeltaCost: Object.freeze({ ...(config.refitDeltaCost ?? {}) }),
    attack: config.attack ?? 0,
    defense: config.defense ?? 0,
    tier3Attack: config.tier3Attack ?? (config.attack ?? 0),
    tier3Defense: config.tier3Defense ?? (config.defense ?? 0),
    allowedActions: Object.freeze([...(config.allowedActions ?? [])]),
    allowedBiomes: Object.freeze([...(config.allowedBiomes ?? [])]),
    description: config.description ?? '',
  });
}

/** Stone Age unit roster trained at the Main building. */
export const UNITS = Object.freeze({
  gatherer: createUnit({
    id: 'gatherer',
    name: 'Gatherer',
    speedKmPerHour: 5,
    workDurationHours: 1,
    trainingTimeHours: 0,
    allowedActions: ['gather', 'collect_water'],
    allowedBiomes: ['fields', 'forest', 'water'],
    description: 'Collects sticks, berries, stones, wild roots, straw, clay, ore nuggets, and jars of water.',
  }),
  hunter: createUnit({
    id: 'hunter',
    name: 'Hunter',
    speedKmPerHour: 6,
    workDurationHours: 1,
    trainingTimeHours: 0,
    trainingCost: { sticks: 1 },
    allowedActions: ['hunt', 'collect_water'],
    allowedBiomes: ['fields', 'forest', 'water'],
    description: 'Forages grain on fields, hunts meat & pelts in forests, catches fish and collects water on water tiles.',
  }),
  builder: createUnit({
    id: 'builder',
    name: 'Builder',
    speedKmPerHour: 4,
    workDurationHours: 0,
    trainingTimeHours: 0,
    allowedActions: ['build', 'upgrade'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Travels to construction sites and stays locked until returning to Main.',
  }),
  prospector: createUnit({
    id: 'prospector',
    name: 'Prospector',
    age: 'copper',
    tier: 2,
    trainedAt: 'main',
    popCost: 1,
    trainingCost: { sticks: 4, small_stones: 4, pelts: 2 },
    speedKmPerHour: 5,
    workDurationHours: 1.5,
    allowedActions: ['prospect', 'expedition'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Analyzes Territory rock layers & ore density samples and surveys distant Continent tiles.',
  }),
  scout: createUnit({
    id: 'scout',
    name: 'Scout',
    age: 'copper',
    tier: 2,
    trainedAt: 'expedition_outpost',
    popCost: 1,
    requiredAnimal: { horse: 1 },
    trainingCost: { pelts: 2 },
    speedKmPerHour: 10,
    workDurationHours: 1.0,
    allowedActions: ['expedition'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Fast mounted explorer (1 Horse + 1 Pop) that reveals 3x3 Continent tiles on expeditions.',
  }),
  caravan: createUnit({
    id: 'caravan',
    name: 'Caravan',
    age: 'copper',
    tier: 2,
    trainedAt: 'market',
    popCost: 1,
    requiredAnimal: { donkey: 1 },
    trainingCost: { wood_logs: 4, pelts: 2 },
    carryCapacity: 150,
    speedKmPerHour: 4,
    workDurationHours: 0,
    allowedActions: ['expedition', 'trade'],
    allowedBiomes: ['fields', 'forest', 'water'],
    description: 'Donkey-drawn freight team (1 Donkey + 1 Pop, 150 bulk cap) needed to haul expedition loot home.',
  }),
  spearman: createUnit({
    id: 'spearman',
    name: 'Spearman',
    age: 'copper',
    tier: 2,
    trainedAt: 'barracks',
    popCost: 1,
    requiredTechs: ['stone_spear'],
    upgradeTechs: ['bronze_spear', 'bronze_armor'],
    trainingCost: { copper_ingot: 1, sticks: 3, leather: 1 },
    tier3TrainingCost: { bronze_ingot: 2, planks: 2, leather: 1 },
    refitDeltaCost: { bronze_ingot: 1 },
    attack: 8,
    defense: 14,
    tier3Attack: 14,
    tier3Defense: 24,
    speedKmPerHour: 5,
    workDurationHours: 1,
    allowedActions: ['expedition', 'escort'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Polearm garrison & escort specialist; protects teams and refits cleanly from Copper to Bronze.',
  }),
  swordsman: createUnit({
    id: 'swordsman',
    name: 'Swordsman',
    age: 'copper',
    tier: 2,
    trainedAt: 'barracks',
    popCost: 1,
    requiredTechs: ['copper_sword', 'wood_shield'],
    upgradeTechs: ['bronze_sword', 'bronze_shield', 'bronze_armor'],
    trainingCost: { copper_ingot: 2, wood_logs: 2, leather: 1 },
    tier3TrainingCost: { bronze_ingot: 3, planks: 2, leather: 2 },
    refitDeltaCost: { bronze_ingot: 2, leather: 1 },
    attack: 12,
    defense: 10,
    tier3Attack: 22,
    tier3Defense: 18,
    speedKmPerHour: 5,
    workDurationHours: 1,
    allowedActions: ['expedition', 'escort'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Shielded close-combat soldier trained with Copper/Bronze Sword & Shield technologies.',
  }),
  archer: createUnit({
    id: 'archer',
    name: 'Archer',
    age: 'copper',
    tier: 2,
    trainedAt: 'barracks',
    popCost: 1,
    requiredTechs: ['wood_bow'],
    upgradeTechs: ['composite_bow', 'leather_armor'],
    trainingCost: { sticks: 4, straw: 2, leather: 1 },
    tier3TrainingCost: { planks: 3, rope: 2, bronze_ingot: 1, leather: 1 },
    refitDeltaCost: { bronze_ingot: 1, planks: 2 },
    attack: 10,
    defense: 6,
    tier3Attack: 18,
    tier3Defense: 12,
    speedKmPerHour: 6,
    workDurationHours: 1,
    allowedActions: ['expedition', 'escort'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Mobile ranged marksman eliminating forest predators at range without melee casualties.',
  }),
  cavalry: createUnit({
    id: 'cavalry',
    name: 'Cavalry',
    age: 'copper',
    tier: 2,
    trainedAt: 'barracks',
    popCost: 2,
    requiredAnimal: { horse: 1 },
    requiredTechs: ['saddle', 'copper_sword'],
    upgradeTechs: ['bronze_sword', 'bronze_armor'],
    trainingCost: { copper_ingot: 2, leather: 2 },
    tier3TrainingCost: { bronze_ingot: 3, leather: 3 },
    refitDeltaCost: { bronze_ingot: 2, leather: 1 },
    attack: 16,
    defense: 12,
    tier3Attack: 28,
    tier3Defense: 22,
    speedKmPerHour: 10,
    workDurationHours: 1,
    allowedActions: ['expedition', 'escort'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Fast saddled shock rider (1 Horse + 2 Pop) for rapid expedition security.',
  }),
  fishing_boat: createUnit({
    id: 'fishing_boat',
    name: 'Fishing Boat',
    age: 'bronze',
    tier: 3,
    trainedAt: 'port',
    popCost: 1,
    requiredTechs: ['bronze_saw'],
    trainingCost: { planks: 6, rope: 2 },
    carryCapacity: 60,
    speedKmPerHour: 6,
    workDurationHours: 1,
    allowedActions: ['expedition', 'collect_water'],
    allowedBiomes: ['water'],
    description: 'Planked Port vessel hauling coastal fish and expedition rations.',
  }),
  transport_ship: createUnit({
    id: 'transport_ship',
    name: 'Transport Ship',
    age: 'bronze',
    tier: 3,
    trainedAt: 'port',
    popCost: 2,
    requiredTechs: ['bronze_saw'],
    trainingCost: { planks: 12, rope: 4, bronze_ingot: 2 },
    carryCapacity: 400,
    speedKmPerHour: 8,
    workDurationHours: 1,
    allowedActions: ['expedition', 'trade'],
    allowedBiomes: ['water'],
    description: 'Heavy sea/river freight ship (400 bulk cap) for large-scale Continent expeditions.',
  }),
});

/** Ordered array of all defined units. */
export const UNIT_LIST = Object.freeze(Object.values(UNITS));
