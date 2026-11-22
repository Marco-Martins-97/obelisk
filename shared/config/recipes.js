/**
 * Data-driven crafting & evolution recipes (Stone Age -> Copper Age).
 */

/**
 * Normalizes a crafting recipe template with building association and Age trigger.
 *
 * @param {object} config - Recipe configuration fields.
 * @param {string} config.id - Unique recipe identifier.
 * @param {string} config.name - Human-readable recipe name.
 * @param {string} config.buildingId - Building ID required to execute this recipe.
 * @param {Record<string, number>} config.inputs - Consumed resource quantities.
 * @param {Record<string, number>} config.outputs - Produced resource quantities.
 * @param {number} config.craftTimeHours - Processing duration in in-game hours.
 * @param {string} [config.age='stone'] - Tech age of the recipe.
 * @param {number} [config.minBuildingLevel=1] - Minimum building level needed.
 * @param {string | null} [config.unlocksAge=null] - Age unlocked on completion (if any).
 * @param {string | null} [config.unlocksTech=null] - Technology branch unlocked on completion (if any).
 * @param {string} [config.description=''] - Short UI description.
 * @returns {Readonly<object>} Immutable recipe template.
 * @throws {Error} When inputs, outputs, buildingId, or craftTimeHours are invalid.
 */
export function createRecipe(config) {
  if (!config?.id || !config?.name || !config?.buildingId) {
    throw new Error('Recipe template requires id, name, and buildingId.');
  }

  const inputKeys = Object.keys(config.inputs ?? {});
  const outputKeys = Object.keys(config.outputs ?? {});
  if (inputKeys.length === 0 || outputKeys.length === 0) {
    throw new Error(`Recipe "${config.id}" requires non-empty inputs and outputs.`);
  }

  if (!Number.isFinite(config.craftTimeHours) || config.craftTimeHours <= 0) {
    throw new RangeError(`Recipe "${config.id}" craftTimeHours must be > 0.`);
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    age: config.age ?? 'stone',
    buildingId: config.buildingId,
    minBuildingLevel: config.minBuildingLevel ?? 1,
    inputs: Object.freeze({ ...config.inputs }),
    outputs: Object.freeze({ ...config.outputs }),
    craftTimeHours: config.craftTimeHours,
    unlocksAge: config.unlocksAge ?? null,
    unlocksTech: config.unlocksTech ?? null,
    description: config.description ?? '',
  });
}

/** Stone Age crafting and Copper Age evolution recipes. */
export const RECIPES = Object.freeze({
  cook_meat: createRecipe({
    id: 'cook_meat',
    name: 'Cook Meat',
    buildingId: 'firepit',
    inputs: { meat: 1 },
    outputs: { cooked_meat: 1 },
    craftTimeHours: 0.5,
    description: 'Roast raw game meat into edible cooked meat.',
  }),
  cook_fish: createRecipe({
    id: 'cook_fish',
    name: 'Cook Fish',
    buildingId: 'firepit',
    inputs: { fish: 1 },
    outputs: { cooked_fish: 1 },
    craftTimeHours: 0.4,
    description: 'Grill caught river or lake fish over the firepit.',
  }),
  craft_charcoal: createRecipe({
    id: 'craft_charcoal',
    name: 'Burn Charcoal',
    buildingId: 'kiln',
    inputs: { sticks: 4 },
    outputs: { charcoal: 2 },
    craftTimeHours: 1.5,
    description: 'Slow-burn sticks inside a clay kiln to produce high-heat charcoal.',
  }),
  smelt_copper_ingot: createRecipe({
    id: 'smelt_copper_ingot',
    name: 'Smelt Copper Ingot',
    buildingId: 'kiln',
    inputs: { copper_nugget: 10, charcoal: 2 },
    outputs: { copper_ingot: 1 },
    craftTimeHours: 2.5,
    unlocksAge: 'copper',
    unlocksTech: 'copper_age',
    description: 'Smelt 10 copper nuggets with charcoal to trigger the Copper Age tech branch.',
  }),
});

/** Ordered array of all defined recipes. */
export const RECIPE_LIST = Object.freeze(Object.values(RECIPES));
