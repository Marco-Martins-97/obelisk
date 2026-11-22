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
 * @param {number} [config.popCost=1] - Population slots occupied by each trained unit.
 * @param {string} [config.age='stone'] - Tech age unlocking this unit.
 * @param {number} [config.tier=1] - Unit tier.
 * @param {string} [config.trainedAt='main'] - Building ID that trains this unit.
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
  const popCost = config.popCost ?? 1;

  if (!Number.isFinite(speedKmPerHour) || speedKmPerHour <= 0) {
    throw new RangeError(`Unit "${config.id}" speedKmPerHour must be > 0.`);
  }
  if (!Number.isFinite(workDurationHours) || workDurationHours < 0) {
    throw new RangeError(`Unit "${config.id}" workDurationHours must be >= 0.`);
  }
  if (!Number.isInteger(popCost) || popCost < 1) {
    throw new RangeError(`Unit "${config.id}" popCost must be an integer >= 1.`);
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
    allowedActions: ['gather', 'collect_water'],
    allowedBiomes: ['fields', 'forest', 'water'],
    description: 'Collects sticks, berries, stones, seeds, straw, clay, ore nuggets, and jars of water.',
  }),
  hunter: createUnit({
    id: 'hunter',
    name: 'Hunter',
    speedKmPerHour: 6,
    workDurationHours: 1,
    allowedActions: ['hunt'],
    allowedBiomes: ['fields', 'forest', 'water'],
    description: 'Forages grain on fields, hunts meat & pelts in forests, and catches fish in water.',
  }),
  builder: createUnit({
    id: 'builder',
    name: 'Builder',
    speedKmPerHour: 4,
    workDurationHours: 0,
    allowedActions: ['build', 'upgrade'],
    allowedBiomes: ['fields', 'forest'],
    description: 'Travels to construction sites and stays locked until returning to Main.',
  }),
});

/** Ordered array of all defined units. */
export const UNIT_LIST = Object.freeze(Object.values(UNITS));
