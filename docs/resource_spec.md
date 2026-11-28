# Resource, Unit & Economy Specification (Age-by-Age Vertical Slice)

## 1. Data-Driven Factories (`createResource` & `createUnit`)
All resources live in `/shared/config/resources.js` via `createResource()`, and all units live in `/shared/config/units.js` via `createUnit()`. Settlement inventories store `{ resourceId -> quantity }` maps so new era content never requires database migrations.

---

## 2. Stage 3 — Stone Age Resources, Water Jars & Yields

### Starting Stockpile (`MAIN` Building)
- **General Storage (`60/250`):** `10 sticks` (`20` space), `10 pelts` (`20` space), `5 small_stones` (`10` space), `5 berries` (`10` space) — each `small` (`sizeClass: 2`).
- **Food (`5` stored):** Derived from edible inventory (`5 berries × 1 = 5` rations) plus fractional ration carry; consumed automatically in **FEFO** order.
- **Water (`5/10` bowls):** `5` water bowls stored inside a `10`-bowl **Jar** (`1 jar = 10 water bowls`).
- **Starter Tech:** `wood_tools` (technology tree node, not stored as a physical inventory item).
- **Population (`0/10`):** `10` available population capacity, `0` units trained at spawn.

### Gathering (`gatherer` & `hunter` Teams — Timed, Slowest Speed & Return Reveal)
Teams (`1+` Gatherers and/or Hunters) march at the **slowest unit's speed** (`km/h`; `1 territory sub-tile = 500m` / `0.5 km`). Total action lifecycle = **`Traveling (MAIN → tile) → Working (action) → Returning (tile → MAIN)`**. Quick dispatch rows (`[Gather - 1 +]`, `[Hunt - 1 +]`) send solo specialty squads in one click, while the **`[Team >]`** submenu uses Smart Role Assignment so Gatherers gather, Hunters hunt, and assigned water haulers collect `10` bowls each on a single trip at the slowest unit's speed. Newly discovered `3×3` terrain is revealed once the team (or Builder) returns to `MAIN`:

| Territory Tile Type | Action | Possible Yields |
| :--- | :--- | :--- |
| **Fields (Open Land)** | `Gather` | `small_stones`, `roots` (Wild Roots), `straw` |
| **Water (Lake / River / Spring)** | `Gather` (Panning) | `clay`, `ore_nuggets` from **any ore except `flux` and `coal`** (`copper`, `iron`, `tin`, `nickel`, `silver`, `gold`, `gems`) |
| **Water (Lake / River / Spring)** | `Collect Water` (`Gatherer` + `Hunter`) | **`1 jar` (`10` water bowls)** per unit into water storage |
| **Forest** | `Gather` | `berries`, `sticks` |

### Hunting (`hunter` Unit — Timed & Probabilistic)
Round-trip timed action (`outbound + hunt + return`) with probabilistic yields:

| Territory Tile Type | Possible Yields |
| :--- | :--- |
| **Fields (Open Land)** | `grain` |
| **Forest** | `meat`, `pelt` |
| **Water (Lake / River / Spring)** | `fish` |

### Stone Age Crafted Items & Age Evolution Trigger
- **Cooked, Dried/Cured Food & Fertilizers/Containers:**
  - **`FIREPIT`:** Raw `meat` (`45%/d` spoil) → `cooked_meat` (`3` food, `20%/d`), raw `fish` (`50%/d` spoil) → `cooked_fish` (`2` food, `25%/d`), **`boil_salt`** (`2 sticks + 10 water bowls` → `2 salt`, `1.0h`), **`burn_wood_ash`** (`2 sticks` → `1 wood_ash` `[K]`), **`crush_bone_meal`** (`1 bone` → `2 bone_meal` `[P]`), and **`craft_woven_basket`** (after `basket_weaving`: `+15` general storage bulk each).
  - **`DRYING_RACK` (requires `stone_tools`):** Air-dried `dried_meat` (`3` food, `5%/d`), `dried_fish` (`2` food, `6%/d`), and salt-cured `salted_meat` (`4` food, `1%/d`), `salted_fish` (`3` food, `1%/d`).
  - **`KILN`:** Charcoal (`+wood_ash`), **`craft_clay_vessel`** (after `clay_vessels`: `+10` water bowls & `+20` preserved food capacity at `0.7×` spoilage each), and Ore/Nugget smelting (`1 craft button` per ingot output).
- **Salt Acquisition (`Salt-A`):** Boiled from water at a Stone Age **`FIREPIT`** and mined later in the Copper Age from `limestone` and `shale` ore veins (never dropped from river panning).
- **Timed Unit Recruitment, Costs & Dismissal:** Unit recruitment is queued in real time (`trainingTimeHours`: `0.05h` for `Gatherer`/`Hunter`/`Builder`, `0.2–0.35h` for Copper/Barracks troops, `0.4–0.6h` for Bronze naval vessels), reserving `popUsed` immediately until completion and cancellable inside the first `10%` of task duration. `Gatherer` & `Builder` are free (`{}`); `Hunter` costs `1 stick` (`1 stick + 1 small_stone` once `stone_tools` unlocks); `Prospector`, `Scout`, `Caravan`, Barracks troops, and Port ships consume configured material/livestock costs. Idle units can be dismissed anytime via `dismissUnit` (`Dispense -1` / `-1`).
- **Crop Field Harvest & Secondary Straw:** Harvesting mature `Grain` (`CROPS.grain`) drops `grain` plus `0.6×` (`Math.max(1, Math.round(qty * 0.6))`) `straw`.
- **Forest Predator Encounters:** Forest operations roll `Wolf` (`10%`) or `Bear` (`4%`) encounters — unescorted Gatherers risk 1 death, while Hunters and Barracks escorts (`Spearman`, `Swordsman`, `Archer`, `Cavalry`) slay predators for bonus `meat`, `bones`, and `pelts`.
- **Fuel:** `sticks` and `charcoal` (crafted at the **`KILN`** or **`FORGE`**).
- **Copper & Bronze Age Progression:** Smelting `copper_ingot` passively unlocks **`copper_age`** (`MAIN` Tier 2); smelting `bronze_ingot` at `KILN` or `FORGE` passively unlocks **`bronze_age`** (`MAIN` Tier 3); smelting `iron_ingot` at `BLOOMERY` passively unlocks **`iron_age`** (`MAIN` Tier 4).

### 2.4 Technology Tree (`/shared/config/technologies.js`)
Tools are **permanent, player-persistent technologies** rather than physical storage items (`researchMode`: `'starter' | 'passive' | 'research'`), auto-applying `getBestUnlockedTool` and moving completed researches out of active research lists:

| Tech Node | Tier / Mode | Trigger to Unlock Branch | Research Cost & Time | Modifiers & Unlocks |
| :--- | :--- | :--- | :--- | :--- |
| **`wood_tools`** | T1 Starter | Unlocked at spawn (`starter`) | Free (starter tech) | `1.0×` work speed, `0` loot bonus |
| **`stone_tools`** | T2 Research | Build **`1 FIREPIT`** | At `FIREPIT`: `{ small_stones: 3, sticks: 2 }`, `1.0h` | **`+20%`** work speed, **`+1`** max loot, **`-50%`** empty weight, unlocks **`KILN`** |
| **`basket_weaving`** | T1 Research | Build **`1 FIREPIT`** | At `FIREPIT` / `WORKSHOP` / `SMOKEHOUSE` | `[Research] -> [Craft]` `woven_basket` (`+15` general storage bulk each) |
| **`clay_vessels`** | T2 Research | Build **`1 KILN`** | At `KILN` / `FORGE` | `[Research] -> [Craft]` `clay_vessel` (`+10` water cap & `+20` preserved food cap) |
| **`copper_age`** | T2 Passive | Craft **`1 copper_ingot`** at `KILN` | Automatic passive unlock | Upgrades `MAIN` to Tier 2 + unlocks **`SMITHY`** |
| **`stone_axe`..`stone_hammer`**, **`stone_knife`**, **`stone_sickle`** | T2 Research | Build **`SMITHY`** | At `SMITHY` / `FORGE` (`bones` + `sticks`/`small_stones`) | Unlocks Copper Age extraction, `N/P/K` farming, wells, granaries, walls, markets, outposts |
| **`copper_*`**, **`wood_bow`**, **`copper_sword`**, **`wood_shield`** | T2 Research | Prerequisite starter tool | `{ copper_ingot, sticks, ... }` at `SMITHY` / `FORGE` | **`+35%`** work speed, `Workshop` (`copper_saw`), `Smokehouse` (`copper_knife`), `Barracks` troops |
| **`bronze_age`** | T3 Passive | Smelt **`1 bronze_ingot`** at `KILN` / `FORGE` | Automatic passive unlock | Upgrades `MAIN` to Bronze Age (`Tier 3`) + unlocks **`FORGE`** (`copper_hammer`) |
| **`bronze_*`**, **`composite_bow`**, **`bronze_sword`**, **`bronze_shield`**, **`bronze_armor`** | T3 Research | Build **`FORGE`** (`bronze_age` + `copper_hammer`) | At `FORGE` (`bronze_ingot`, `planks`, `leather`) | Unlocks `Port` (`bronze_saw`), `Bloomery` (`bronze_pickaxe` + `bronze_hammer`), Barracks Bronze refits |
| **`leather_working`**, **`leather_armor`**, **`saddle`** | T2 Research | Build **`WORKSHOP`** | At `WORKSHOP` | `[Research] -> [Craft]` `leather`; unlocks `Cavalry` (`saddle`) & unit armors |
| **`iron_age`** | T4 Passive | Smelt **`1 iron_ingot`** at `BLOOMERY` | Automatic passive unlock | Unlocks Iron Age (`MAIN` Tier 4) |

---

## 3. Survival, Spoilage, Storage Pooling & Bulk Mechanics
- **Unified Pooled Storage (`M1`):** Active `MAIN` and `WAREHOUSE` levels sum into shared village bulk storage (`+250/lv`), with `preservedStorageBonusPerLevel` slots reserved for future preservation buildings (e.g., Copper Age Granary/Root Cellar) that protect fastest-spoiling foods first.
- **Auto-Feeding (`C1` / FEFO) & Daily Consumption (`popUsed`):** Consumes **`1 food` and `1 water bowl` per `popUsed`** per in-game day (`1 day = 4h` real time; `28 days = 1 lunar month`; `3 months = 1 season`; `4 seasons = 1 year`). Edible items are automatically eaten **fastest-spoiling first**, preserving excess rations from multi-food items in `foodCarry`. Unused housing capacity consumes nothing (`0/10` consumes `0`).
- **Per-Type Fractional Spoilage (`S1`):** Each food type defines `spoilRatePerDay`; partial losses accumulate lazily in `spoilageCarry` across days so small stacks do not vanish immediately on day 1.
- **5-Stage Starvation/Dehydration Debuff & Recovery:** Missing food or water triggers sequential daily penalties (**Day 1 Hunger I** `-10%`, **Day 2 Hunger II** `-30%`, **Day 3 Hunger III** `-50%`, **Day 4 Sickness** `-80%` work/travel speed, lower gather/hunt success & yield, **Day 5+ Death** `-80%` + `-10% maxPop/day`), collapsing into an **Abandoned Village** if effective max population reaches `0`. Fed/hydrated days recover **`+20%` efficiency/day** and **`+10%` max population/day**.
- **Day / Night Cycle:** Tracked continuously within each 4-hour in-game day (visual/clock only in Stone Age; no gameplay penalty yet).
- **Linear `sizeClass` (1–5) Bulkiness:** Linearly scales warehouse capacity and caravan/expedition carry limits (`1` = 1 unit, `2` = 2 units, ..., `5` = 5 units):
  - `1` (**Tiny**): Salt, eggs, gems, coins, ancient relics.
  - `2` (**Small**): Sticks, straw, pelts, small stones, wild roots, ingots, ore nuggets, berries, rations.
  - `3` (**Medium**): Logs, raw ores, clay.
  - `4` (**Big**): Cut stone blocks, timber beams, barrels.
  - `5` (**Large**): Heavy machinery parts, monolith blocks.
- **Future Ages (Copper → Bronze → Iron → Steel):** Add `geologyTags` underground mining, `Tribal Wars`-style marketplace caravans, and Obelisk expedition supplies.
