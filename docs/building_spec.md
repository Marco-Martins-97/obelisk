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
| **`FIREPIT`** | Evolving kitchen lineage (`T1 Firepit` `maxLevel: 1` → `T2 Hearth & Drying Rack` → `T3 Smokehouse & Kitchen` → `T4 Iron Bakery & Kitchen`). Cooks, boils salt, cures meat/fish (T2+), and bakes Bread / smokes food (T3+). | `1` (T1), `1..3` (T2+) | `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ sticks: 4, small_stones: 3 }` (`1.5h`) |
| **`HOUSE`** | Evolving housing (`T1 Tent` → `T2 Hut` → `T3 Wood House` → `T4 Stone House` → `T5 Brick House`) scaling Max Pop (`10/40/130/350/800`). | `1..3` | `workersRequired: 0`, `buildersRequired: 1`, Cost: `{ sticks: 6, pelts: 4, straw: 4 }` (`2.0h`) |
| **`WAREHOUSE`** | Evolving warehouse (`T1 Storage Pit` → `T2 Mud Warehouse` → `T3 Timber Warehouse` → `T4 Stone Warehouse` → `T5 Brick Warehouse`) scaling bulk capacity (`250/1000/5000/15000/40000`). | `1..3` | No tech required (`requiredTechs: []`); `workersRequired: 0`, `buildersRequired: 1`, Cost: `{ sticks: 8, pelts: 4, straw: 6 }` (`2.0h`) |
| **`KILN`** | Evolving furnace lineage (`T1 Clay Kiln` → `T2 Brick Kiln` → `T3 Bloomery Furnace` → `T4 Blast Furnace`). Fires Clay Vessels and smelts Copper, Bronze, Iron (`iron_age`), and Steel (`steel_age`) via Charcoal or Coal. | `1..3` | Requires `stone_tools`; `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ small_stones: 5, clay: 8, straw: 4, sticks: 4 }` (`3.0h`) |
| **`SMITHY`** | Evolving smithy lineage (`T2 Copper Smithy` → `T3 Bronze Forge` → `T4 Iron Blacksmith`) researching Stone → Copper → Bronze → Iron tools, weapons, armors, `longbow`, and Blueprint `crossbow`. | `1..3` | Tier 2 (`Main` T2); `workersRequired: 1`, Cost: `{ sticks: 8, small_stones: 6, clay: 4, pelts: 2 }` (`1.5h`) |
| **`TIMBER_CAMP`** | Continuously fells `wood_logs` on forest tiles until `forestLeft === 0`. | `1..3` | Requires `stone_axe`, `forest_only`; `workersRequired: 1` |
| **`MINE`** | Continuously extracts all hosted ores (`ore_ore`) scaled by layer density (`100k × d`). | `1..3` | Requires `bone_pickaxe`; `workersRequired: 2` |
| **`QUARRY`** | Continuously cuts `stone_blocks` on any land tile (`50k` deposit). | `1..3` | Requires `bone_pickaxe`; `workersRequired: 1` |
| **`CLAY_PIT`** | Continuously digs `clay` adjacent to water (`10k` deposit). | `1..3` | Requires `stone_shovel`, `near_water`; `workersRequired: 1` |
| **`WELL`** | Passively draws water bowls/day scaled by `0.5 + 0.7×territoryMoisture + 0.3×tileMoisture` & expands water cap. | `1..3` | Requires `stone_shovel`; `workersRequired: 0` |
| **`FARM` / `CROP_FIELD` / `ANIMAL_PEN` / `ORCHARD`** | `FARM` protects seed vault & caps adjacent `Crop Field` (64 slots, `N/P/K` soil nutrients), `Animal Pen` (livestock capture + `Kill -1` slaughter), and `Orchard` (9 saplings). | `1..3` | Requires `stone_hoe`; attachments must be placed adjacent to active `FARM` |
| **`GRANARY`** | Dedicated food warehouse reducing daily spoilage by `-60%` (highest spoil first). | `1..3` | Requires `stone_hammer`; `preservedStorageTierBases: { 2: 500, 3: 1500 }` |
| **`MARKET`** | Crafts `Caravan` (`1 donkey + 1 pop`, `150` bulk carry) & swaps goods `1:1`. | `1..3` | Requires `stone_hammer`; `workersRequired: 1` |
| **`EXPEDITION_OUTPOST`** | Trains mounted `Scout` (`1 horse + 1 pop`, `0.25h`) & dispatches Continent expeditions. | `1..3` | Requires `stone_hammer`; `workersRequired: 1` |
| **`WALL`** | Internal perimeter fortification inside `MAIN` (Wood → Stone → Brick); protects active City zone tiles (`0 / 1×1 / 3×3 / 5×5 / 7×7` by `MAIN` Tier) & cuts building degradation. | `1..3` | Requires `stone_spear`; built inside `MAIN` (`defenseTierBases: { 1: 10, 2: 15, 3: 45, 4: 70 }`) |
| **`WORKSHOP`** | Saws `wood_logs` → `planks`, tans `pelts` → `leather`, braids `rope`, weaves baskets, and researches `leather_working` / `leather_armor` / `saddle`. | `1..3` | Tier 2 (`copper_saw`); `workersRequired: 1` |
| **`WATCHTOWER`** | Unlocks at Bronze (`T3`, `3` pop): `T3 Wood Watchtower` → `T4 Stone Watchtower` → `T5 Steel Watchtower`; projects a yellow `3×3` protection aura. | `1..3` | Tier 3 (`bronze_age`, `stone_spear`); `workersRequired: 3` |
| **`PORT`** | Coastal/river dock (`near_water`) fishing continuously (`15/40/d`) and building `Fishing Boat`, `Transport Ship`, and T4 `Merchant Ship` (`1000` cargo). | `1..3` | Tier 3 (`bronze_saw`); `workersRequired: 2` |
| **`BARRACKS`** | Trains `Spearman`, `Swordsman`, `Archer`, `Cavalry`, and T4 `Knight`; performs multi-tier Copper→Bronze→Iron→Crossbow unit refits. | `1..3` | Tier 2 base (`stone_spear`); `workersRequired: 1` |
| **`WINDMILL`** | Auto-crafts any unlocked recipe (`1` configurable slot per level); elevation efficiency scales `50%–150%` across buildable elevation. | `1..3` | Tier 4 (`iron_saw` + `blueprint_windmill`); `workersRequired: 1` |
| **`WATERMILL`** | Coastal/river (`near_water`) auto-crafter (`1` slot per level) operating at a steady `100%` speed. | `1..3` | Tier 4 (`iron_saw` + `blueprint_watermill`); `workersRequired: 1` |

### 2.1 `MAIN` Tier vs. Building Level & Age Downgrade Rules
- **Age Controller (`MAIN.tier`):** Each village tracks its own `MAIN` Tier (`1` Stone → `2` Copper → `3` Bronze → `4` Iron → `5` Steel), while `MAIN.level` (`1..3`) scales local storage and housing capacity.
- **Base-Tier Placement & Direct Tier Advancement:** Newly placed buildings start at their template base unlock Tier (`def.tier`) and can advance Tier directly at any level (`Lv 1..maxLevel`, resetting to `Lv 1`) whenever `MAIN.tier >= targetTier`.
- **Free Tier Downgrade:** Players may freely downgrade `MAIN.tier` (`0` cost) to return that village to an earlier Age:
  - Existing buildings keep their higher Tier and stats.
  - Higher-tier upgrades remain locked while `MAIN.tier` is below the target Tier.
- **Upgrading `MAIN` Tier:** Always consumes normal materials and builder round-trip time (even after a prior downgrade), gated by the corresponding Age tech unlock (`copper_age` T2, `bronze_age` T3, `iron_age` T4, `steel_age` T5).

---

## 3. Core Building & Interaction Rules
1. **Round-Trip Construction Lifecycle, Population Usage & 10% Cancel Window:**
   - Creating a building consumes materials, employs `workersRequired` population, and locks `>= 1` `builder` across a round-trip lifecycle (`1 tile = 500m` / `0.5 km` from `MAIN (12, 12)` to target `(x, y)`):
     - **Traveling (`t_travel`):** Builder walks `MAIN → tile`.
     - **Working (`t_build`):** Building finishes and becomes active at `now + t_travel + t_build`.
     - **Returning (`t_travel`):** Builder walks `tile → MAIN`, unlocks availability, and reveals the `3×3` Territory border around `(x, y)` at `now + 2 * t_travel + t_build`.
   - Any active task (`build`, `upgrade`, `upgrade_main`, `upgrade_tier`, `upgrade_wall`, `craft`, `research`, `train_unit`, `unit_action`, `expedition`, `prospect`) can be cancelled cleanly via `canCancelTask` (`TASK_CANCEL_WINDOW_RATIO = 0.1`) during the **first `10%` of total virtual duration**, refunding spent materials, livestock, water bowls, food, freed units/builders, and reverting incomplete buildings/walls.
2. **Left-Click Building Interaction (`BuildingModal`):**
   - **Initial Construction (`constructing`):** Displays `"Building..."`, real-time `HH:MM:SS` completion/return countdown timers, and a `Cancel` button while within the first `10%`.
   - **Active & Sequential Queue (`active`):** Crafting, unit training, and research inside a building run sequentially **1 item/unit at a time** (stacking consecutive identical orders onto the same queue line with upfront resource deduction). Via `getTaskCancelInfo`, the active 1st item locks after its first `10%`, while waiting items `2..N` and unstarted queued entries remain refundable (`Cancel Queued`). Windmills & Watermills likewise craft 1 item at a time round-robin across `1..3` slots, deducting inputs upfront per craft.
3. **Right-Click Menus (`TileActionMenu`):**
   - **Placed Buildings:** Opens quick actions (`Open`, `Repair`, `Repair All`, `Quick Harvest`, `Quick Craft`, `Upgrade`, `Advance to Tier X`, `Destroy Building` with confirmation) plus a `Tile Actions (Gather / Hunt)` toggle.
   - **Empty Tiles (`[Build >]`):** Buttons use `data-build-status` styling (`ready` green, `grey` missing resources, `red` locked/blocked) and show real-time `HH:MM:SS` durations via `formatRealHoursHMS`, while the footer displays `have/needed Resource` cost items.
4. **Safe Building Destruction (`demolishBuilding`):**
   - Permanently removes non-`MAIN` buildings with 0 material refund and clamps water, blocking demolition if `maxPop < popUsed` or dependent Farmstead attachments would be stranded.
5. **Settlement Limits (Capital vs. Villages, Colonization & Conquest):**
   - **Capital (`7×7`):** A player may manually upgrade `MAIN` to Tier 5 (`7×7` Capital) only if they have **0** existing Capitals (`hasExistingCapital === false`). However, conquering an Abandoned Capital retains its Tier 5 status.
   - **Colonization:** Empty buildable Continent tiles can be colonized via a Continent expedition carrying `1 Builder` (returns home), transport carry capacity `>= 100`, `COLONY_STARTER_COST` supplies, and `2×` food/water rations; new colonies start at Copper Age (`MAIN` Tier 2, Level 1) with all global techs/blueprints and a starter buffer.
   - **Abandoned Village Conquest:** Bandit-held Abandoned Villages (`banditPower = abandonedMainTier × 40`) can be conquered by sending `>= 1 Knight` (consumed on victory) alongside troops whose attack strength meets or exceeds `banditPower`.
6. **Degradation, 3-Day Buffer, Repair & Abandonment:**
   - Active buildings start at `condition: 100` with `graceDaysRemaining: 3` (`BUILDING_DEGRADATION_GRACE_DAYS`), then lose `2%/day` (`4%/day` in Winter, reduced up to `80%` by internal `City Wall` inside active City tiles or covering `Watchtower` `3×3` auras without additive stacking).
   - Degradation scales continuous production efficiency; players repair individual buildings or `Repair All` inside `MAIN`.
   - If average active building condition falls below `20%` (`VILLAGE_ABANDON_AVG_CONDITION`), the village becomes **Abandoned**; clicking **Start New Village** relocates to a fresh Continent tile while keeping the ruined village marked on the Continent map.
