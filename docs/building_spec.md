# Building System Specification (Age-by-Age Vertical Slice)

## 1. Universal Building Factory (`createBuilding`)
All buildings are defined in `/shared/config/buildings.js` via `createBuilding()` with normalized defaults:
- `id`, `name`, `age` (`'stone' | 'copper' | 'bronze' | 'iron' | 'steel'`)
- `maxLevel`, `buildTime` (duration in seconds/minutes), `buildersRequired` (min `1` available `builder` in Stone Age; scales in future ages), `workersRequired` (population used to operate the building)
- `cost` (`{ [resourceId]: amount }`)
- `storageCapacity`, `waterCapacity`, `popCapacity`
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

## 2. Stage 3 — Stone Age Buildings (Tier 1 Only, Level Upgradable)

| Building | Role & Starting State | Levels | Workers / Builders & Lv 1 Cost |
| :--- | :--- | :--- | :--- |
| **`MAIN`** | Pre-placed village center at `(12, 12)`. Provides starting `storage: 50/100` (`10 sticks`, `10 pelts`, `5 small_stones`), `pop: 0/10`, `food: 5`, and `water: 5/10` (`1 jar` = `10` bowls). Trains `gatherer`, `hunter`, `builder`. | `1+` | Pre-built at village founding |
| **`FIREPIT`** | Cooks raw `meat` → `cooked_meat`, `fish` → `cooked_fish`, and upgrades starter tools (`wood_tool` → `stone_tool`). | `1+` | `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ sticks: 4, small_stones: 3 }` |
| **`HOUSE`** | Increases maximum settlement population by **`+10` per level**. | `1..3` | `workersRequired: 0`, `buildersRequired: 1`, Cost: `{ sticks: 6, pelts: 4, straw: 4 }` |
| **`KILN`** | Crafts `charcoal` and smelts `10 copper_nuggets` into `1 copper_ingot` to unlock **Copper Age** evolution. | `1+` | `workersRequired: 1`, `buildersRequired: 1`, Cost: `{ small_stones: 5, clay: 8, straw: 4, sticks: 4 }` |

---

## 3. Core Building & Interaction Rules
1. **Round-Trip Construction Lifecycle & Population Usage:**
   - Creating a building consumes materials, employs `workersRequired` population, and locks `>= 1` `builder` across a round-trip lifecycle (`1 tile = 500m` / `0.5 km` from `MAIN (12, 12)` to target `(x, y)`):
     - **Outbound Travel (`t_travel`):** Builder walks `MAIN → tile`.
     - **Construction (`t_build`):** Building finishes at `now + t_travel + t_build`.
     - **Return Travel (`t_travel`):** Builder walks `tile → MAIN` and becomes available again only at `now + 2 * t_travel + t_build`.
2. **Left-Click Building Interaction (Online UI):**
   - **Under Construction:** Displays `"Building..."` and the remaining countdown timer (`buildEndsAt`).
   - **Completed:** Opens the **Building Menu** containing building info, crafting recipes, upgrades, and unit training (for `MAIN`).
3. **Right-Click Build Submenu Colors (Online UI):**
   - **Normal:** Valid tile, free builder, and sufficient resources—buildable now.
   - **Grey:** Valid placement and unlocked, but **insufficient resources**.
   - **Red:** **Cannot build** (unbuildable/shrouded/occupied tile, no free builder, or locked).
4. **Settlement Limits (Capital vs. Villages):**
   - **Capital (`7×7`):** A player may upgrade only **1** settlement to a Capital.
   - **Cities / Villages (`5×5`):** Players may own multiple villages.
   - **Open Edge Case (Deferred to Conquest Stage):** Conquering another player's Capital (auto-downgrade to `5×5` vs. hard cap).
5. **Degradation & Maintenance:**
   - Buildings degrade lazily over in-game time (`6×` real time, accelerated in Winter) based on `lastUpdated` math.
   - Degradation lowers efficiency/capacity and **never** permanently destroys core buildings offline.
