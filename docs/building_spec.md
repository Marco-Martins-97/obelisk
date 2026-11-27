# Building System Specification (Age-by-Age Vertical Slice)

## 1. Universal Building Factory (`createBuilding`)
All buildings are defined in `/shared/config/buildings.js` via `createBuilding()` with normalized defaults:
- `id`, `name`, `age` (`'stone' | 'copper' | 'bronze' | 'iron' | 'steel'`)
- `maxLevel`, `buildTime` (duration in seconds/minutes), `buildersRequired` (min `1` available `builder` in Stone Age; scales in future ages), `workersRequired` (population used to operate the building)
- `cost` (`{ [resourceId]: amount }`)
- `storageBonusPerLevel`, `preservedStorageBonusPerLevel`, `spoilageMultiplier`, `waterCapacity`, `popBonusPerLevel`
- `recipes` (crafting/smelting IDs runnable inside the building)

MongoDB stores only dynamic building instances per settlement:
```js
// Conceptual instance stored in DB
{
  buildingId: 'main',
  gridX: 12,
  gridY: 12,
  level: 1,
  condition: 100,       // 0–100% durability
  buildEndsAt: null,    // Timestamp while under construction
  lastUpdated: Date
}
```

---

## 2. Stage 3 — Stone Age Buildings (Tier 1 Base, `MAIN` Tier Controls Age)

| Building | Role & Starting State | Levels | Requirements, Workers & Cost |
| :--- | :--- | :--- | :--- |
| **`MAIN`** | Pre-placed village center at `(12, 12)` (`tier: 1`, `level: 1`). Provides starting `storage: 60/250` (`10 sticks`, `10 pelts`, `5 small_stones`, `5 berries`), `pop: 0/10`, stored `food: 5` (FEFO auto-eaten), and `water: 5/10` (`1 jar` = `10` bowls). Trains `gatherer`, `hunter`, `builder`. | `1..3` | Pre-built; Level upgrade (`+250` storage, `+10` pop, `10/25/50` water bowls at Lv 1/2/3): base `{ sticks: 8, pelts: 5, straw: 5 } × targetLevel` (`2.5h`, `1` builder); Tier 2 (`Copper Age`) requires `copper_age` tech + `{ small_stones: 8, sticks: 8, straw: 6, pelts: 4, clay: 6 }` (`4.0h`, `1` builder) |
| **`FIREPIT`** | Cooks raw `meat`/`fish`, boils `salt`, burns `wood_ash` (K) & `bone_meal` (P); unlocks & researches **`stone_tools`** and **`basket_weaving`** (`[Research] -> [Craft]`). | `1..3` | `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ sticks: 4, small_stones: 3 }` (`1.5h`) |
| **`HOUSE`** | Increases maximum settlement population by **`+10` per level** (fractional Tier bases `10/40/130`). | `1..3` | `workersRequired: 0`, `buildersRequired: 1`, Cost: `{ sticks: 6, pelts: 4, straw: 4 }` (`2.0h`) |
| **`WAREHOUSE`** | Expands unified village bulk storage (`250/1000/5000` Tier bases). | `1..3` | No tech required (`requiredTechs: []`); `workersRequired: 0`, `buildersRequired: 1`, Cost: `{ sticks: 8, pelts: 4, straw: 6 }` (`2.0h`) |
| **`DRYING_RACK`** | Air-dries `meat`/`fish` or salt-cures them into `dried_*` / `salted_*` provisions to slow spoilage. | `1..3` | Requires `stone_tools` (`requiredTechs: ['stone_tools']`); `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ sticks: 5, pelts: 2, straw: 2 }` (`1.5h`) |
| **`KILN`** | Crafts `charcoal` (`+wood_ash`), researches & fires **`clay_vessels`**, and smelts Copper/Bronze ingots (`bronze_ingot` triggers **`bronze_age`**). | `1..3` | Requires `stone_tools`; `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ small_stones: 5, clay: 8, straw: 4, sticks: 4 }` (`3.0h`) |
| **`SMITHY`** | Copper Age workshop researching 6 Stone/Bone starter tools → Copper upgrades. | `1..3` | Tier 2 (`Main` T2); `workersRequired: 1`, Cost: `{ sticks: 8, small_stones: 6, clay: 4, pelts: 2 }` (`1.5h`) |
| **`TIMBER_CAMP`** | Continuously fells `wood_logs` on forest tiles until `forestLeft === 0`. | `1..3` | Requires `stone_axe`, `forest_only`; `workersRequired: 1` |
| **`MINE`** | Continuously extracts all hosted ores (`ore_ore`) scaled by layer density (`100k × d`). | `1..3` | Requires `bone_pickaxe`; `workersRequired: 2` |
| **`QUARRY`** | Continuously cuts `stone_blocks` on any land tile (`50k` deposit). | `1..3` | Requires `bone_pickaxe`; `workersRequired: 1` |
| **`CLAY_PIT`** | Continuously digs `clay` adjacent to water (`10k` deposit). | `1..3` | Requires `stone_shovel`, `near_water`; `workersRequired: 1` |
| **`WELL`** | Passively draws water bowls/day scaled by `0.5 + 0.7×territoryMoisture + 0.3×tileMoisture` & expands water cap. | `1..3` | Requires `stone_shovel`; `workersRequired: 0` |
| **`FARM` / `CROP_FIELD` / `ANIMAL_PEN` / `ORCHARD`** | `FARM` protects seed vault & caps adjacent `Crop Field` (64 slots, `N/P/K` soil nutrients), `Animal Pen` (livestock capture + `Kill -1` slaughter), and `Orchard` (9 saplings). | `1..3` | Requires `stone_hoe`; attachments must be placed adjacent to active `FARM` |
| **`GRANARY`** | Dedicated food warehouse reducing daily spoilage by `-60%` (highest spoil first). | `1..3` | Requires `stone_hammer`; `preservedStorageTierBases: { 2: 500, 3: 1500 }` |
| **`MARKET`** | Crafts `Caravan` (`1 donkey + 1 pop`, `150` bulk carry) & swaps goods `1:1`. | `1..3` | Requires `stone_hammer`; `workersRequired: 1` |
| **`EXPEDITION_OUTPOST`** | Trains mounted `Scout` (`1 horse + 1 pop`) & dispatches Continent expeditions. | `1..3` | Requires `stone_hammer`; `workersRequired: 1` |
| **`WALL`** | Internal fortification built & upgraded inside `MAIN`; adds defense % & cuts building degradation. | `1..3` | Requires `stone_spear`; built inside `MAIN` (`defenseTierBases: { 2: 15, 3: 45 }`) |

### 2.1 `MAIN` Tier vs. Building Level & Age Downgrade Rules
- **Age Controller (`MAIN.tier`):** Each village tracks its own `MAIN` Tier (`1` Stone → `2` Copper → `3` Bronze → `4` Iron → `5` Steel), while `MAIN.level` (`1..3`) scales local storage and housing capacity.
- **Building Inheritance on Newly Claimed Villages:** Player technologies persist globally across claimed territories, while each new village starts its local `MAIN` Tier from Tier 1 and upgrades buildings independently.
- **Free Tier Downgrade:** Players may freely downgrade `MAIN.tier` (`0` cost) to return that village to an earlier Age:
  - Existing buildings keep their higher Tier and stats.
  - Newly placed buildings are constructed at the **current `MAIN.tier`**.
  - Higher-tier upgrades/progression remain locked while `MAIN.tier` is downgraded.
- **Upgrading `MAIN` Tier:** Always consumes normal materials and builder round-trip time (even after a prior downgrade), gated by the corresponding Age tech unlock (e.g., `copper_age` for Tier 2).

---

## 3. Core Building & Interaction Rules
1. **Round-Trip Construction Lifecycle & Population Usage:**
   - Creating a building consumes materials, employs `workersRequired` population, and locks `>= 1` `builder` across a round-trip lifecycle (`1 tile = 500m` / `0.5 km` from `MAIN (12, 12)` to target `(x, y)`):
     - **Traveling (`t_travel`):** Builder walks `MAIN → tile`.
     - **Working (`t_build`):** Building finishes and becomes active at `now + t_travel + t_build`.
     - **Returning (`t_travel`):** Builder walks `tile → MAIN`, unlocks availability, and reveals the `3×3` Territory border around `(x, y)` at `now + 2 * t_travel + t_build`.
2. **Left-Click Building Interaction (`BuildingModal`):**
   - **Initial Construction (`constructing`):** Displays `"Building..."` and real-time `HH:MM:SS` completion/return countdown timers.
   - **Active & Upgrading (`active`):** Level/Tier upgrades keep `status: 'active'` so players can continue grouped single-`Craft` production (`via Ore`/`via Nuggets`, batch `qty` + `Max`), researching pending techs (moving completed techs into a bottom `Researched Technologies` dropdown), training/dispensing units (`Train +1` / `Dispense -1`), repairing/destroying buildings, and viewing exact next-level/tier stat previews (`getBuildingUpgradePreview`) alongside `have/needed` red missing-cost highlights (`CostInline`) and real-time `HH:MM:SS` durations.
3. **Right-Click Menus (`TileActionMenu`):**
   - **Placed Buildings:** Opens quick actions (`Open`, `Repair`, `Repair All`, `Quick Harvest`, `Quick Craft`, `Upgrade` with real-time `HH:MM:SS`, `Destroy Building` with confirmation) plus a `Tile Actions (Gather / Hunt)` toggle.
   - **Empty Tiles (`[Build >]`):** Buttons use `data-build-status` styling (`ready` green, `grey` missing resources, `red` locked/blocked) and show real-time `HH:MM:SS` durations via `formatRealHoursHMS`, while the footer displays `have/needed Resource` cost items.
4. **Safe Building Destruction (`demolishBuilding`):**
   - Permanently removes non-`MAIN` buildings with 0 material refund and clamps water, blocking demolition if `maxPop < popUsed` or dependent Farmstead attachments would be stranded.
5. **Settlement Limits (Capital vs. Villages):**
   - **Capital (`7×7`):** A player may upgrade only **1** settlement to a Capital.
   - **Cities / Villages (`5×5`):** Players may own multiple villages.
   - **Open Edge Case (Deferred to Conquest Stage):** Conquering another player's Capital (auto-downgrade to `5×5` vs. hard cap).
6. **Degradation, 3-Day Buffer, Repair & Abandonment:**
   - Active buildings start at `condition: 100` with `graceDaysRemaining: 3` (`BUILDING_DEGRADATION_GRACE_DAYS`), then lose `2%/day` (`4%/day` in Winter, reduced up to `80%` by internal `City Wall`).
   - Degradation scales continuous production efficiency; players repair individual buildings or `Repair All` inside `MAIN`.
   - If average active building condition falls below `20%` (`VILLAGE_ABANDON_AVG_CONDITION`), the village becomes **Abandoned**; clicking **Start New Village** relocates to a fresh Continent tile while keeping the ruined village marked on the Continent map.
