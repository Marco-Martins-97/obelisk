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
 * @param {number} [config.waterCostBowls=0] - Water reserve bowls consumed per craft batch.
 * @param {string} [config.age='stone'] - Tech age of the recipe.
 * @param {number} [config.minBuildingLevel=1] - Minimum building level needed.
 * @param {string | null} [config.primaryOutputId] - Primary item ID produced (used when grouping alternative recipes).
 * @param {string | null} [config.requiredTech=null] - Technology ID required before crafting this recipe.
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

  const waterCostBowls = config.waterCostBowls ?? 0;
  if (!Number.isFinite(waterCostBowls) || waterCostBowls < 0) {
    throw new RangeError(`Recipe "${config.id}" waterCostBowls must be >= 0.`);
  }

  return Object.freeze({
    id: config.id,
    name: config.name,
    age: config.age ?? 'stone',
    buildingId: config.buildingId,
    minBuildingLevel: config.minBuildingLevel ?? 1,
    inputs: Object.freeze({ ...config.inputs }),
    waterCostBowls,
    outputs: Object.freeze({ ...config.outputs }),
    primaryOutputId: config.primaryOutputId ?? outputKeys[0],
    requiredTech: config.requiredTech ?? null,
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
  boil_salt: createRecipe({
    id: 'boil_salt',
    name: 'Boil Salt',
    buildingId: 'firepit',
    inputs: { sticks: 2 },
    waterCostBowls: 10,
    outputs: { salt: 2 },
    craftTimeHours: 1.0,
    description: 'Boil village water over a firepit to crystallize edible salt.',
  }),
  dry_meat: createRecipe({
    id: 'dry_meat',
    name: 'Dry Meat',
    buildingId: 'drying_rack',
    inputs: { meat: 1 },
    outputs: { dried_meat: 1 },
    craftTimeHours: 1.0,
    description: 'Air-dry raw meat on racks to cut daily spoilage without salt.',
  }),
  dry_fish: createRecipe({
    id: 'dry_fish',
    name: 'Dry Fish',
    buildingId: 'drying_rack',
    inputs: { fish: 1 },
    outputs: { dried_fish: 1 },
    craftTimeHours: 0.8,
    description: 'Air-dry raw fish on racks to reduce daily spoilage without salt.',
  }),
  salt_meat: createRecipe({
    id: 'salt_meat',
    name: 'Salt Meat',
    buildingId: 'drying_rack',
    inputs: { meat: 1, salt: 1 },
    outputs: { salted_meat: 1 },
    craftTimeHours: 1.2,
    description: 'Salt-cure raw meat for very long-lasting stored provisions.',
  }),
  salt_fish: createRecipe({
    id: 'salt_fish',
    name: 'Salt Fish',
    buildingId: 'drying_rack',
    inputs: { fish: 1, salt: 1 },
    outputs: { salted_fish: 1 },
    craftTimeHours: 1.0,
    description: 'Salt-cure raw fish for very long-lasting stored provisions.',
  }),
  craft_charcoal: createRecipe({
    id: 'craft_charcoal',
    name: 'Burn Charcoal',
    buildingId: 'kiln',
    inputs: { sticks: 4 },
    outputs: { charcoal: 2, wood_ash: 1 },
    primaryOutputId: 'charcoal',
    craftTimeHours: 1.5,
    description: 'Slow-burn sticks inside a clay kiln to produce high-heat charcoal and wood ash.',
  }),
  burn_wood_ash: createRecipe({
    id: 'burn_wood_ash',
    name: 'Burn Wood Ash',
    buildingId: 'firepit',
    inputs: { sticks: 2 },
    outputs: { wood_ash: 1 },
    craftTimeHours: 0.5,
    description: 'Reduce sticks into potassium-rich Wood Ash (K) fertilizer at a Firepit.',
  }),
  crush_bone_meal: createRecipe({
    id: 'crush_bone_meal',
    name: 'Crush Bone Meal',
    buildingId: 'firepit',
    inputs: { bones: 1 },
    outputs: { bone_meal: 2 },
    craftTimeHours: 0.5,
    description: 'Char and crush salvaged bones into phosphorus-rich Bone Meal (P) fertilizer.',
  }),
  craft_woven_basket: createRecipe({
    id: 'craft_woven_basket',
    name: 'Craft Woven Basket',
    buildingId: 'firepit',
    requiredTech: 'basket_weaving',
    inputs: { sticks: 3, straw: 2 },
    outputs: { woven_basket: 1 },
    craftTimeHours: 0.8,
    description: 'Weave sturdy baskets that add +15 pooled storage bulk capacity each.',
  }),
  craft_clay_vessel: createRecipe({
    id: 'craft_clay_vessel',
    name: 'Craft Clay Vessel',
    buildingId: 'kiln',
    requiredTech: 'clay_vessels',
    inputs: { clay: 2, sticks: 1 },
    outputs: { clay_vessel: 1, wood_ash: 1 },
    primaryOutputId: 'clay_vessel',
    craftTimeHours: 1.0,
    description: 'Fire glazed Clay Vessels adding +10 water bowls & +20 preserved food capacity.',
  }),
  smelt_copper_ingot: createRecipe({
    id: 'smelt_copper_ingot',
    name: 'Smelt Copper Ingot (Nuggets)',
    buildingId: 'kiln',
    inputs: { copper_nugget: 10, charcoal: 2 },
    outputs: { copper_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'copper_ingot',
    craftTimeHours: 2.5,
    unlocksAge: 'copper',
    unlocksTech: 'copper_age',
    description: 'Smelt 10 copper nuggets with charcoal to trigger the Copper Age tech branch.',
  }),
  smelt_copper_ore: createRecipe({
    id: 'smelt_copper_ore',
    name: 'Smelt Copper Ore',
    age: 'copper',
    buildingId: 'kiln',
    inputs: { copper_ore: 5, charcoal: 1 },
    outputs: { copper_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'copper_ingot',
    craftTimeHours: 1.5,
    unlocksAge: 'copper',
    unlocksTech: 'copper_age',
    description: 'Smelt mined Copper Ore chunks with charcoal into pure Copper Ingots.',
  }),
  smelt_bronze_ingot: createRecipe({
    id: 'smelt_bronze_ingot',
    name: 'Alloy Bronze Ingot (Nuggets)',
    age: 'bronze',
    buildingId: 'kiln',
    inputs: { copper_ingot: 2, tin_nugget: 4, charcoal: 2 },
    outputs: { bronze_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'bronze_ingot',
    craftTimeHours: 2.5,
    unlocksAge: 'bronze',
    unlocksTech: 'bronze_age',
    description: 'Combine Copper Ingots and panned Tin Nuggets to smelt Bronze and unlock the Bronze Age.',
  }),
  smelt_bronze_from_ore: createRecipe({
    id: 'smelt_bronze_from_ore',
    name: 'Alloy Bronze Ingot (Ore)',
    age: 'bronze',
    buildingId: 'kiln',
    inputs: { copper_ore: 4, tin_ore: 2, charcoal: 2 },
    outputs: { bronze_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'bronze_ingot',
    craftTimeHours: 2.5,
    unlocksAge: 'bronze',
    unlocksTech: 'bronze_age',
    description: 'Smelt mined Copper Ore and Tin Ore together into Bronze Ingots to unlock the Bronze Age.',
  }),
  saw_planks: createRecipe({
    id: 'saw_planks',
    name: 'Saw Planks',
    age: 'bronze',
    buildingId: 'workshop',
    inputs: { wood_logs: 2 },
    outputs: { planks: 4 },
    craftTimeHours: 0.8,
    description: 'Mill heavy Wood Logs into dressed Planks for shields, boats, and structures.',
  }),
  craft_leather: createRecipe({
    id: 'craft_leather',
    name: 'Tan Leather (Salt)',
    age: 'copper',
    buildingId: 'workshop',
    requiredTech: 'leather_working',
    inputs: { pelts: 2, salt: 1 },
    waterCostBowls: 5,
    outputs: { leather: 2 },
    primaryOutputId: 'leather',
    craftTimeHours: 1.0,
    description: 'Cure Pelts with Salt and Water into durable Leather.',
  }),
  craft_leather_ash: createRecipe({
    id: 'craft_leather_ash',
    name: 'Tan Leather (Wood Ash)',
    age: 'copper',
    buildingId: 'workshop',
    requiredTech: 'leather_working',
    inputs: { pelts: 2, wood_ash: 2 },
    waterCostBowls: 5,
    outputs: { leather: 2 },
    primaryOutputId: 'leather',
    craftTimeHours: 1.2,
    description: 'Dehair and tan Pelts using alkaline Wood Ash and Water.',
  }),
  braid_rope_flax: createRecipe({
    id: 'braid_rope_flax',
    name: 'Braid Rope (Flax)',
    age: 'bronze',
    buildingId: 'workshop',
    inputs: { flax: 2 },
    outputs: { rope: 2 },
    primaryOutputId: 'rope',
    craftTimeHours: 0.6,
    description: 'Twist strong Flax Fibers into durable rigging and bowstring Rope.',
  }),
  braid_rope_straw: createRecipe({
    id: 'braid_rope_straw',
    name: 'Braid Rope (Straw)',
    age: 'bronze',
    buildingId: 'workshop',
    inputs: { straw: 4 },
    outputs: { rope: 1 },
    primaryOutputId: 'rope',
    craftTimeHours: 0.8,
    description: 'Twist dried plains Straw into utility Rope.',
  }),
  bake_bread: createRecipe({
    id: 'bake_bread',
    name: 'Bake Bread',
    age: 'bronze',
    buildingId: 'smokehouse',
    inputs: { grain: 2 },
    waterCostBowls: 2,
    outputs: { bread: 2 },
    craftTimeHours: 0.8,
    description: 'Bake milled Grain and Water into hearty 4-ration Bread loaves.',
  }),
  smoke_meat: createRecipe({
    id: 'smoke_meat',
    name: 'Smoke Meat',
    age: 'bronze',
    buildingId: 'smokehouse',
    inputs: { meat: 2, salt: 1, sticks: 1 },
    outputs: { smoked_meat: 2, wood_ash: 1 },
    primaryOutputId: 'smoked_meat',
    craftTimeHours: 1.2,
    description: 'Hot-smoke meat with Salt for ultra-long-lasting expedition rations.',
  }),
  smoke_fish: createRecipe({
    id: 'smoke_fish',
    name: 'Smoke Fish',
    age: 'bronze',
    buildingId: 'smokehouse',
    inputs: { fish: 2, salt: 1, sticks: 1 },
    outputs: { smoked_fish: 2, wood_ash: 1 },
    primaryOutputId: 'smoked_fish',
    craftTimeHours: 1.0,
    description: 'Hot-smoke fish with Salt for ultra-long-lasting naval rations.',
  }),
  smelt_iron_ore: createRecipe({
    id: 'smelt_iron_ore',
    name: 'Smelt Iron Ingot (Ore)',
    age: 'iron',
    buildingId: 'bloomery',
    inputs: { iron_ore: 5, charcoal: 2, flux: 1 },
    outputs: { iron_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'iron_ingot',
    craftTimeHours: 3.0,
    unlocksAge: 'iron',
    unlocksTech: 'iron_age',
    description: 'Smelt Iron Ore with Charcoal and Flux inside a Bloomery to enter the Iron Age.',
  }),
  smelt_iron_nuggets: createRecipe({
    id: 'smelt_iron_nuggets',
    name: 'Smelt Iron Ingot (Nuggets)',
    age: 'iron',
    buildingId: 'bloomery',
    inputs: { iron_nugget: 10, charcoal: 2, flux: 1 },
    outputs: { iron_ingot: 1, wood_ash: 1 },
    primaryOutputId: 'iron_ingot',
    craftTimeHours: 3.5,
    unlocksAge: 'iron',
    unlocksTech: 'iron_age',
    description: 'Smelt panned Iron Nuggets with Charcoal and Flux into an Iron Ingot.',
  }),
});

/** Ordered array of all defined recipes. */
export const RECIPE_LIST = Object.freeze(Object.values(RECIPES));
