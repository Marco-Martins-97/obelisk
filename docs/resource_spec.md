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
| **Fields (Open Land)** | `Gather` | `small_stones`, `seeds`, `straw` |
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
- **Cooked & Dried/Cured Food:**
  - **`FIREPIT`:** Raw `meat` (`45%/d` spoil) → `cooked_meat` (`3` food, `20%/d`), raw `fish` (`50%/d` spoil) → `cooked_fish` (`2` food, `25%/d`), and **`boil_salt`** (`2 sticks + 10 water bowls` → `2 salt`, `1.0h`).
  - **`DRYING_RACK` (requires `stone_tools`):** Air-dried `dried_meat` (`3` food, `5%/d`), `dried_fish` (`2` food, `6%/d`), and salt-cured `salted_meat` (`4` food, `1%/d`), `salted_fish` (`3` food, `1%/d`).
- **Salt Acquisition (`Salt-A`):** Boiled from water at a Stone Age **`FIREPIT`** and mined later in the Copper Age from `limestone` and `shale` ore veins (never dropped from river panning).
- **Fuel:** `sticks` and `charcoal` (crafted at the **`KILN`**).
- **Copper Age Evolution Trigger:** Smelt **`10 copper_nuggets` + `2 charcoal` → `1 copper_ingot`** in the **`KILN`** (`unlocksTech: 'copper_age'`), unlocking the Tier 2 upgrade on `MAIN` using normal materials.

### 2.4 Technology Tree (`/shared/config/technologies.js`)
Tools are **permanent, player-persistent technologies** rather than physical storage items. All workers automatically apply the highest unlocked tool tier (`getBestUnlockedTool`), and newly claimed villages retain previously unlocked technologies:

| Tech Node | Tier / Type | Trigger to Unlock Branch | Research Cost & Time | Modifiers & Unlocks |
| :--- | :--- | :--- | :--- | :--- |
| **`wood_tools`** | T1 General | Unlocked at spawn (`starter`) | Free (starter tech) | `1.0×` work speed, `0` loot bonus |
| **`stone_tools`** | T2 General | Build **`1 FIREPIT`** | At `FIREPIT`: `{ small_stones: 3, sticks: 2 }`, `1.0h` | **`+20%`** gather/hunt work speed (`1.2×`), **`+1`** max loot, **`-50%`** empty roll weight (`0.5×`), unlocks **`KILN`** |
| **`copper_age`** | T2 Age | Craft **`1 copper_ingot`** at `KILN` | Unlocks `MAIN` Tier 2 upgrade | Permits upgrading `MAIN` to Copper Age (`Tier 2`); prepares Copper specialization tool split (`axe`, `pickaxe`, `hoe`, `hammer`, `spear`) |

---

## 3. Survival, Spoilage, Storage Pooling & Bulk Mechanics
- **Unified Pooled Storage (`M1`):** Active `MAIN` and `WAREHOUSE` levels sum into shared village bulk storage (`+250/lv`), with `preservedStorageBonusPerLevel` slots reserved for future preservation buildings (e.g., Copper Age Granary/Root Cellar) that protect fastest-spoiling foods first.
- **Auto-Feeding (`C1` / FEFO) & Daily Consumption (`popUsed`):** Consumes **`1 food` and `1 water bowl` per `popUsed`** per in-game day (`1 day = 4h` real time; `28 days = 1 lunar month`; `3 months = 1 season`; `4 seasons = 1 year`). Edible items are automatically eaten **fastest-spoiling first**, preserving excess rations from multi-food items in `foodCarry`. Unused housing capacity consumes nothing (`0/10` consumes `0`).
- **Per-Type Fractional Spoilage (`S1`):** Each food type defines `spoilRatePerDay`; partial losses accumulate lazily in `spoilageCarry` across days so small stacks do not vanish immediately on day 1.
- **5-Stage Starvation/Dehydration Debuff & Recovery:** Missing food or water triggers sequential daily penalties (**Day 1 Hunger I** `-10%`, **Day 2 Hunger II** `-30%`, **Day 3 Hunger III** `-50%`, **Day 4 Sickness** `-80%` work/travel speed, lower gather/hunt success & yield, **Day 5+ Death** `-80%` + `-10% maxPop/day`), collapsing into an **Abandoned Village** if effective max population reaches `0`. Fed/hydrated days recover **`+20%` efficiency/day** and **`+10%` max population/day**.
- **Day / Night Cycle:** Tracked continuously within each 4-hour in-game day (visual/clock only in Stone Age; no gameplay penalty yet).
- **Linear `sizeClass` (1–5) Bulkiness:** Linearly scales warehouse capacity and caravan/expedition carry limits (`1` = 1 unit, `2` = 2 units, ..., `5` = 5 units):
  - `1` (**Tiny**): Seeds, gems, coins, ancient relics.
  - `2` (**Small**): Sticks, straw, pelts, small stones, ingots, ore nuggets, berries, rations.
  - `3` (**Medium**): Logs, raw ores, clay.
  - `4` (**Big**): Cut stone blocks, timber beams, barrels.
  - `5` (**Large**): Heavy machinery parts, monolith blocks.
- **Future Ages (Copper → Bronze → Iron → Steel):** Add `geologyTags` underground mining, `Tribal Wars`-style marketplace caravans, and Obelisk expedition supplies.
