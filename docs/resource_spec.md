# Resource, Unit & Economy Specification (Age-by-Age Vertical Slice)

## 1. Data-Driven Factories (`createResource` & `createUnit`)
All resources live in `/shared/config/resources.js` via `createResource()`, and all units live in `/shared/config/units.js` via `createUnit()`. Settlement inventories store `{ resourceId -> quantity }` maps so new era content never requires database migrations.

---

## 2. Stage 3 — Stone Age Resources, Water Jars & Yields

### Starting Stockpile (`MAIN` Building)
- **General Storage (`50/100`):** `10 sticks` (`20` space), `10 pelts` (`20` space), `5 small_stones` (`10` space) — each `small` (`sizeClass: 2`).
- **Food:** `5` starting food.
- **Water (`5/10` bowls):** `5` water bowls stored inside a `10`-bowl **Jar** (`1 jar = 10 water bowls`).
- **Starter Tool:** `wood_tool`.
- **Population (`0/10`):** `10` available population capacity, `0` units trained at spawn.

### Gathering (`gatherer` Unit — Timed & Probabilistic)
Each unit (`gatherer`, `hunter`, `builder`) has a movement speed in `km/h` (`1 territory sub-tile = 500m` / `0.5 km`). Total action duration = **`outbound travel (MAIN → tile) + action work time + return travel (tile → MAIN)`**. Every gather/hunt roll is probabilistic and may occasionally return nothing:

| Territory Tile Type | Action | Possible Yields |
| :--- | :--- | :--- |
| **Fields (Open Land)** | `Gather` | `small_stones`, `seeds`, `straw` |
| **Water (Lake / River / Spring)** | `Gather` (Panning) | `clay`, `ore_nuggets` from **any ore except `flux` and `coal`** (`copper`, `iron`, `tin`, `nickel`, `silver`, `gold`, `gems`) |
| **Water (Lake / River / Spring)** | `Collect Water` | **`1 jar` (`10` water bowls)** at a time into water storage |
| **Forest** | `Gather` | `berries`, `sticks` |

### Hunting (`hunter` Unit — Timed & Probabilistic)
Round-trip timed action (`outbound + hunt + return`) with probabilistic yields:

| Territory Tile Type | Possible Yields |
| :--- | :--- |
| **Fields (Open Land)** | `grain` |
| **Forest** | `meat`, `pelt` |
| **Water (Lake / River / Spring)** | `fish` |

### Stone Age Crafted Items, Tools & Age Evolution
- **Starter Tool Upgrade:** `wood_tool` → `stone_tool` at the **`FIREPIT`**.
- **Cooked Food:** Raw `meat` → `cooked_meat` and raw `fish` → `cooked_fish` cooked at the **`FIREPIT`**.
- **Fuel:** `sticks` and `charcoal` (crafted at the **`KILN`**).
- **Copper Age Evolution Requirement:** Smelt **`10 copper_nuggets` → `1 copper_ingot`** in the **`KILN`**.

---

## 3. Survival, Calendar & Bulk Mechanics
- **Daily Consumption (`popUsed`):** Consumes **`1 food` and `1 water bowl` per `popUsed`** (active units + workers employed in buildings) per in-game day (`1 day = 4h` real time; `28 days = 1 lunar month`; `3 months = 1 season`; `4 seasons = 1 year`). Unused housing capacity consumes nothing (`0/10` consumes `0`).
- **Perishable Decay:** Food spoilage is calculated lazily per in-game day.
- **Day / Night Cycle:** Tracked continuously within each 4-hour in-game day (visual/clock only in Stone Age; no gameplay penalty yet).
- **Linear `sizeClass` (1–5) Bulkiness:** Linearly scales warehouse capacity and caravan/expedition carry limits (`1` = 1 unit, `2` = 2 units, ..., `5` = 5 units):
  - `1` (**Tiny**): Seeds, gems, coins, ancient relics.
  - `2` (**Small**): Sticks, straw, pelts, small stones, ingots, ore nuggets, berries, rations.
  - `3` (**Medium**): Logs, raw ores, clay, basic tools.
  - `4` (**Big**): Cut stone blocks, timber beams, barrels.
  - `5` (**Large**): Heavy machinery parts, monolith blocks.
- **Future Ages (Copper → Bronze → Iron → Steel):** Add `geologyTags` underground mining, `Tribal Wars`-style marketplace caravans, and Obelisk expedition supplies.
