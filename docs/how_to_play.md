# How to Play Obelisk (Stone & Copper Age Guide)

> **Desktop Browser Notice:** Obelisk is built for Desktop web browsers (left/right-click canvas actions, hover tooltips, scroll-wheel zoom). Mobile/phone touch browsers are not fully supported.

## 1. Starting Your Village
You begin at **(12, 12)** inside your `25×25` Territory with:
- **Main Village Hall (Lv 1, Stone Age):** Stores `250` bulk, `10` max pop (`0/10` used), and `10` water bowls (`5/10` starting water).
- **Starter Stockpile (`60/250`):** `10` Sticks, `10` Pelts, `5` Small Stones, and `5` Berries (`5` stored food).
- **Idle Settlement Safety:** While `Pop Used` is `0/10`, villagers consume `0` food and water per day. Daily consumption only starts once you train units or operate staffed buildings.

---

## 2. Training, Dispensing Units & Dispatching Missions
1. **Train & Dispense Units:** Left-click **Main Village Hall** (or click **Open Main Hall**) to train **Gatherers** (`5 km/h`, Free), **Hunters** (`6 km/h`, `1 Stick` -> `1 Stick + 1 Small Stone` after `Stone Tools`), and **Builders** (`4 km/h`, Free). Idle units can be freed anytime via **Dispense -1** in Main Hall or **`-1`** in the right-sidebar **Units** panel.
2. **Send Squads or Mixed Teams:** Right-click any explored empty tile:
   - **Gather:**
     - *Fields:* Small Stones, Wild Roots, Straw.
     - *Forest:* Sticks, Berries.
     - *Water (River / Lake):* Clay and **Ore Nuggets** from non-flux/coal/salt veins (`copper`, `iron`, `tin`, `nickel`, `silver`, `gold`, `gems`).
   - **Hunt:** *Forest* → Raw Meat, Pelts & Bones; *Fields* → Wild Grain; *Water* → Raw Fish.
   - **Forest Predators:** Working in Forests carries a small chance of **Wolf** (`10%`) or **Bear** (`4%`) encounters — unescorted Gatherers risk losses, while Hunters slay predators for extra Meat, Bones, and Pelts.
   - **Collect Water:** On Water tiles, Gatherers or Hunters bring back `1 jar` (`10` water bowls) per unit up to Main water capacity.
   - **Team (>):** Mix Gatherers, Hunters, and Water haulers in one trip moving at the slowest member's speed.
3. **Fog Exploration:** Returning teams/builders reveal a `3×3` box around that tile; exploring all `625` tiles unlocks the surrounding `3×3` Continent tiles.

---

## 3. Food, Water, Baskets, Vessels & Spoilage
- **Daily Survival Rate:** Every in-game day (`4` real hours at `6×` Offline speed), `Pop Used` eats **`1 food + 1 water bowl` per pop**.
- **Auto-Eating (`FEFO`) & Spoilage:** Edible inventory is consumed **fastest-spoiling first**, preserving leftover fractions in `foodCarry` while leftovers decay fractionally (`spoilageCarry`).
- **Preservation & Storage Unlocks (`[Research] -> [Craft]`):**
  - Build a **Firepit** (`4` Sticks, `3` Small Stones) to cook Meat/Fish, boil **Salt**, crush **Bone Meal** (`P`), burn **Wood Ash** (`K`), and research **Woven Baskets** -> craft `+15` general storage bulk each.
  - Build a **Drying Rack** (`Stone Tools`) to dry or salt-cure rations (`1%/d` spoil).
  - Build a **Clay Kiln** (`Stone Tools`) to burn Charcoal (`+Wood Ash`), craft **Clay Vessels** (`+10` water bowls & `+20` preserved food capacity at `0.7×` spoil), and smelt Ore/Nuggets (`via Ore` / `via Nuggets` under 1 `Craft` button) into Copper/Bronze Ingots.

---

## 4. Starvation / Dehydration Debuffs & Recovery
Running short on food or water triggers sequential daily debuffs:
- **Day 1 — Hunger I:** `-10%` speed, gather/hunt success, and yield.
- **Day 2 — Hunger II:** `-30%` efficiency penalty.
- **Day 3 — Hunger III:** `-50%` efficiency penalty.
- **Day 4 — Sickness:** `-80%` efficiency penalty.
- **Day 5+ — Death:** `-80%` efficiency penalty **and `-10%` max population per day** (whole-unit casualties start from whichever unit type has the most population so no single role is unfairly erased, and never kill half-units). If max population hits `0`, the village becomes **Abandoned** (Click **Reset Save** to restart).
- **Recovery:** Each fully fed and hydrated day restores **`+20%` efficiency** and **`+10%` max population**.

---

## 5. Building Material Roles & Copper Age Goal
- **Basic Materials (`Sticks`, `Pelts`, `Straw`):** **Main Hall** upgrades (`+250` pooled storage, `+10` max pop, and `10 / 25 / 50` water bowls across Lv 1 / 2 / 3), **House** (`+10` max pop/lv), **Warehouse** (`+250` pooled storage/lv), and **Drying Rack**.
- **Stone Buildings (`Small Stones` + `Clay`):** **Firepit** (cooks, boils salt, researches **Stone Tools**) and **Clay Kiln** (crafts **Charcoal** and smelts **`10` Copper Nuggets + `2` Charcoal → `1` Copper Ingot**, unlocking Copper Age).

---

## 6. Copper Age Progression (Tier 2+)
1. **Smithy & 6 Specialized Tools:** Once Main reaches Tier 2, build a **Smithy** (`8` Sticks, `6` Small Stones, `4` Clay, `2` Pelts) and research **`Stone Axe`**, **`Bone Pickaxe`**, **`Stone Hoe`**, **`Stone Spear`**, **`Stone Shovel`**, and **`Stone Hammer`** — then upgrade them with **Copper Ingots** (`Researched Technologies` move to a collapsible bottom dropdown).
2. **Prospecting & Continuous Production:** Train **Prospectors** at Main and right-click explored tiles (`Prospect Tile` → `View Prospection Report`) before placing **Mines**, **Timber Camps** (forest tiles), **Quarries**, **Clay Pits** (near water), and moisture-scaled **Wells**.
3. **N/P/K Farming, Orchards & Animal Slaughter:** Build a **Farmstead** to guard Grain & Wild Roots and attach **Crop Fields** (plant in Spring; restore Nitrogen **N** with **Manure**, Phosphorus **P** with **Bone Meal**, Potassium **K** with **Wood Ash**), **Orchards** (`Saplings`), and **Animal Pens** (Hunters capture Horses, Donkeys, Goats, Sheep, Chickens; click **`Kill -1`** to butcher Meat, Bones & Pelts).
4. **Building Degradation, Quick Menus & Relocation:** Buildings start with a `3`-day buffer before losing `2%/day` (`4%/day` in Winter; reduced up to `80%` by internal **City Walls**). Right-click any placed building for **Quick Actions** (`Open`, `Repair`, `Quick Harvest`, `Quick Craft`, `Upgrade`, `Destroy Building`) or use **Repair All** in Main Hall. Average condition `< 20%` abandons the village — click **Start New Village** to start fresh elsewhere while leaving an `Abandoned` marker on the Continent.
5. **Markets & Continent Expeditions:** Trade 1:1 at the **Market** (`Caravan` = `1 Donkey + 1 Pop`), train **Scouts** (`1 Horse + 1 Pop`) at **Expedition Outpost**, right-click the **Continent Map** to dispatch distance-scaled expeditions, and smelt **Bronze Ingots** at the Kiln to unlock the **Bronze Age**.

---

## 7. HUD Modals, Real-Time Timers & Sandbox Controls
- **Header Modals:** Open **Stockpile**, **Technologies**, and **Village Log** from the status header bar. Inside **Stockpile**, switch category tabs (**All**, **Materials**, **Food**, **Ores**, **Ingots**) and left-click any item card to discard items.
- **Real-Time Timers & Costs (`have/needed`):** All crafting, research, build, and upgrade timers display wall-clock `HH:MM:SS` durations adjusted by speed & starvation penalty; missing materials appear in red (`0/10 Straw`).
- **Sandbox (`/sandbox`):** Includes Dev map layers plus **Unlock Map**, **Unlock Continent**, **`+1 Day` / `+1 Month` / `+1 Year`** time jumps, and an **Add Resource** tool.
