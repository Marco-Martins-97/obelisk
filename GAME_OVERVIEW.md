# Obelisk — Game Overview & Build Plan

**Obelisk** is an asynchronous, browser-based MMORTS built on the **MERN stack + Socket.io**. It blends the persistent world map, timed expeditions, and marketplace trading of *Tribal Wars* with the geological scarcity, seasonal survival, and progression depth of *TerraFirmaCraft (TFC)*—shifting the core focus from war and conquest to **survival, exploration, and trading**.

---

## 1. Core Pillars
- **Exploration & The Obelisk:** A single ancient ruined city of magic—**The Obelisk**—exists on the `100×100` continent. Players prepare and dispatch timed expeditions to explore both their local `25×25` regional territories and distant world tiles, culminating in expeditions to the Obelisk to uncover lost technologies and treasures.
- **TFC-Inspired Survival & Scarcity:** Resources are not uniform. Ores and minerals follow geological rock strata, food spoils over time, fuel is required for warmth and smelting, and seasons cycle continuously.
- **Tribal Wars-Style Trading:** Regional geological scarcity drives trade. Players use marketplaces and timed caravans to exchange surplus resources for what they lack.
- **Asynchronous MMORTS:** No twitch combat or 1-second server ticks. Actions resolve via discrete timestamps and lazy state evaluation.

---

## 2. Time, Calendar & Day/Night Scale (`6×` Real Time)
| Unit | In-Game Duration | Real-Time Equivalent |
| :--- | :--- | :--- |
| **1 Day** | 1 in-game day (1 Day/Night cycle) | **4 hours** |
| **1 Real Day** | 6 in-game days | **24 hours** |
| **1 Lunar Month** | 28 in-game days (1 lunar cycle) | **112 hours** (~4.67 real days) |
| **1 Season** | 3 lunar months (84 days) | **14 real days** (2 real weeks) |
| **1 Year** | 4 seasons / 12 months (336 days) | **56 real days** (~8 real weeks) |

- **Seasons:** Cycle continuously through **Spring → Summer → Autumn → Winter**, affecting temperature, crop growth, spoilage rates, and expedition preparation requirements.
- **Day / Night Cycle:** Continuous cycle inside each 4-hour in-game day (visual/state clock only in Stone Age; no gameplay penalty yet).
- **Daily Survival Tick (Lazy Evaluation):** Food consumption, water consumption, and perishable decay are calculated per in-game day from `lastUpdated` timestamps. Consumption equals **`popUsed`** (active units + workers employed in buildings), not `popCapacity` (e.g., `7/10` pop consumes `7` food and `7` water bowls per day; `0/10` consumes `0`).

---

## 3. Settlements, Map Exploration & Auto-Zoom
- **Age-Scaled Active City Zone (`CITY_SIZE_BY_MAIN_TIER`):** Terrain generation reserves a dry, forest-free `7×7` central pad (`inSettlementZone`), while the active protected City area centered on `MAIN` scales by `MAIN` Tier: **`Stone` = `0`** (`none`), **`Copper` = `1×1`**, **`Bronze` = `3×3`**, **`Iron` = `5×5`**, **`Steel` = `7×7`**. Built `City Wall` perimeters protect tiles inside this active square; `Watchtower` (`3×3` aura) projects protection around any placement via `max()` overlap.
- **Capital (`7×7` grid) vs. Cities (`5×5` grid):** Endgame settlement ownership rules restrict players to **1** upgraded Capital while supporting multiple Colonies / Cities (`+ Spawn Colony` in Sandbox).
- **Territory Exploration (`25×25`, `1 tile = 500m` [`0.5 km`]):** Starts with the central **`7×7`** revealed (viewport zoomed in to the explored area). Actions target an **already-explored (`1`) tile `x`** and upon the team or builder returning to `MAIN` reveal the **`3×3` box `[x-1..x+1, y-1..y+1]`** around `x` (`[[1,1,1],[1,1,1],[1,1,x]] → [[1,1,1,0],[1,1,1,1],[1,1,x,1],[0,1,1,1]]`), zooming out dynamically.
- **Continent Exploration (`100×100`, `1 tile = 12.5 km`):** Starts with **`1` tile** (the player's village, zoomed in). Fully exploring all `25×25` tiles of the home Territory unlocks a **`1`-tile ring (`3×3`)** around the village on the Continent. Each subsequent Continent tile explored (via expeditions) unlocks a **`3×3` area** and zooms out dynamically.
- **3 Acquisition Paths** *(mechanics deferred to a later stage)*:
  1. Conquer another player's city/village.
  2. Conquer an abandoned village.
  3. Found a new settlement (requires an expensive expedition).
- **Open Design Edge Case:** Keeping a conquered enemy Capital conflicts with the strict 1-Capital-per-player rule and introduces an alt-account Capital-farming exploit. Resolution (e.g., auto-downgrade to `5×5` on capture vs. hard cap) will be finalized when conquest is designed.

---

## 4. Tech Stack & Free-Tier Hosting
| Layer | Technology | Hosting (Free Tier) |
| :--- | :--- | :--- |
| **Frontend (`/client`)** | React, Vite, Tailwind CSS | **Vercel** (separate instance attached to personal domain via subdomain) |
| **Shared Logic (`/shared`)** | Pure ES6+ JS (no Node/DOM APIs) | Bundled into both `/client` and `/server` |
| **Backend (`/server`)** | Node.js, Express, Socket.io | **Render** (persistent web service) |
| **Database** | MongoDB (Mongoose) | **MongoDB Atlas** (M0 512MB) |
| **Job Queue (Stage 5+)** | BullMQ + Redis | **Upstash** or **Render Redis** |
| **Testing** | Vitest | Local / CI |

---

## 5. Staged Build Roadmap (Age-by-Age Vertical Slices)
We build strictly **one stage/age at a time**—completing buildings, units, resources, recipes, and gameplay mechanics together for each era so players always have a complete playable progression loop:

0. **Stage 0 — Monorepo & Tooling Bootstrap** *(Complete)*
   - npm workspaces (`shared`, `client`, `server`), pure ESM, Vitest, ESLint (`Math.random` ban in `/shared/generators/`), Vite + React + Tailwind CSS.
1. **Stage 1 — World & Territory Generation (`/shared`)** *(Complete)*
   - Deterministic `N×N` Continent generator (default `100×100`: elevation, temperature, moisture, single-layer rock provinces, biomes, single buildable Obelisk).
   - Deterministic `M×M` Territory generator (default `25×25`: neighbor-interpolated terrain, rivers/lakes, `>= 1` water tile, water-distance moisture, `>= 1` forest tile, rarity-scaled per-ore layers, dry `7×7` settlement zone).
2. **Stage 2 — Map Viewport & Dev Visualizer (`/client`)** *(Complete)*
   - Dual **Gameplay** (surface tile sprites) & **Dev** (heatmap layers, `10×` Territory contrast, `60%` red unbuildable overlay) HTML5 Canvas views with on-screen `+1` frustum culling and clamped pan/zoom.
3. **Stage 3 — Stone Age Vertical Slice** *(Complete — v0.3.0)*
   - **Starter Spawn:** Central N-S band (`30%–70%`) across full W-E range with 1 pre-placed `MAIN` building (`tier: 1`, `level: 1`, `storage: 60/250` [`10 sticks`, `10 pelts`, `5 small_stones`, `5 berries` at `small: 2`], `pop: 0/10`, stored `food: 5`, `water: 5/10` bowls [`1 jar = 10 bowls`]) and starter **`wood_tools`** technology (`STARTER_UNLOCKED_TECHS`).
   - **`MAIN` Age Controller (`Tier 1..5`) vs. Building `Level` (`1..3`):** `MAIN` Tier controls the village Age (with storage/housing scaled by `MAIN` Level). Players may **downgrade `MAIN` Tier for free** to return to a prior Age; existing buildings keep their built Tier while new buildings spawn at current `MAIN` Tier, and higher-tier upgrades are blocked until `MAIN` advances again. Upgrading `MAIN` always consumes normal materials and builder time.
   - **Stone Age Buildings (`MAIN`, `FIREPIT`, `HOUSE`, `WAREHOUSE`, `DRYING_RACK`, `KILN`):** Timed construction (`outbound travel MAIN→tile + buildTime + return travel tile→MAIN`, `1 tile = 500m` / `0.5 km`) consuming basic materials (`sticks`, `pelts`, `straw`) for `MAIN`/`HOUSE`/`WAREHOUSE`/`DRYING_RACK` and stone (`small_stones`) for `FIREPIT`/`KILN`; `MAIN` levels scale water storage (`10 / 25 / 50` bowls across Lv `1 / 2 / 3`), `WAREHOUSE` adds `+250` pooled storage/lv, and `DRYING_RACK` & `KILN` require `stone_tools`.
   - **Unified Storage, FEFO Survival, Fractional Spoilage & Starvation Debuffs:** Active buildings pool village bulk capacity (`M1`), villagers automatically consume `1 food + 1 water bowl` per `popUsed`/day in **fastest-spoiling-first (`C1`/FEFO)** order, leftovers decay via per-type fractional spoilage carry (`S1`), salt comes from boiling water at `FIREPIT` (or future `limestone`/`shale` mining), and ration deficits trigger 5 debuff stages (**Hunger I/II/III → Sickness → Death** with balanced cross-role casualty trimming → **Abandoned Village** at `0` max pop), recovering `+20%` eff and `+10%` maxPop/day when fed.
   - **Stone Age Units (`gatherer`, `hunter`, `builder`):** Speed-based (`km/h`) solo or mixed teams (`Traveling → Working → Returning`, slowest unit speed) with probabilistic tile-specific yields across Fields, Water (including `1 jar` water collection by Gatherers or Hunters & non-flux/coal/salt ore panning), and Forest.
   - **Offline vs. Sandbox UI Split:** Sticky Top Navbar (`react-router`) switches between **Offline (`/`)** (speed locked at `6x`) and **Sandbox (`/sandbox`)** (with `1×–3600×` speed selector plus **`+ Spawn Colony` & Territory Switcher**, **Unlock Map**, **Unlock Continent**, **`+1 Day`/`+1 Month`/`+1 Year`** time jumps, and **Add Resource** controls) and a **How to Play** modal above a sticky Village Header Bar (threshold-colored `Storage`/`Pop` `>90%` orange & `100%` red, `Food`/`Water` `<10%` orange & `0%` red, debuff stage badge, and modal triggers for **Stockpile**, **Unlocked Technologies**, and **Village Log**), full-size `672×672` **Territory ↔ Continent** map toggling (dynamic City/Watchtower yellow aura + tier-colored `City Wall` border), right-sidebar panels (**Production (`/day`)** → **Units** with white names, color-coded `Free / Total` counters, and idle `-1` dispense → **Active Timers** with real-time `Conclusion: HH:MM:SS` & **10%-window `Cancel` button**), left-click `BuildingModal` (`CostInline`, upgrade previews, real-time `HH:MM:SS` unit/recipe/build durations), and right-click Quick Action menus.
   - **Technology Tree & Copper Age Trigger:** Tools live in the **Technology Tree** (`/shared/config/technologies.js`, player-persistent across claimed villages) and distinguish passive vs. active research unlocks (`researchMode`): building `FIREPIT` unlocks researching **`stone_tools`** and **`basket_weaving`** (`[Research] -> [Craft]` `woven_basket` `+15` general storage bulk), `KILN` unlocks **`clay_vessels`** (`clay_vessel` `+10` water cap & `+20` preserved food at `0.7×` spoilage), and smelting **`1 copper_ingot`** triggers passive **`copper_age`** to unlock upgrading **`MAIN` to Tier 2** (`{ small_stones: 8, sticks: 8, straw: 6, pelts: 4, clay: 6 }`, `4.0h`).
4. **Stage 4 — Copper Age Vertical Slice** *(Complete — v0.4.0)*
   - **`SMITHY`, Specialized Tool Branches & Timed Recruitment:** Building `SMITHY` unlocks researching the 6 starter tool branches plus `stone_knife`/`stone_sickle`, upgraded to Copper (`+35%` efficiency). Units train over speed-scaled real-time timers (`trainingTimeHours`: `0.05h` Stone, `0.2–0.35h` Copper/Military, `0.4–0.6h` Naval) reserving `popUsed` immediately; `Gatherer`/`Builder` remain free while `Hunter` (`1 stick` -> `1 stick + 1 small_stone`) and advanced units consume materials/livestock; any task is cancellable inside its first `10%` duration (`canCancelTask`) with full refunds.
   - **Fractional Tier-Level Math (`calculateTierLevelValue`):** Tiered stats compute smoothly below the next tier's base value (`round(B_T + (B_{T+1} - B_T) * ((L - 1) / L_max))`), and buildings reset to Lv 1 when advancing Tiers (without disabling active buildings while upgrading).
   - **Prospecting, Depleting Deposits & Continuous Auto-Production:** `Prospector` surveys tiles into qualitative sample reports (`Nothing Found`..`Very Large Sample`); `Mine` extracts all present ores simultaneously scaled by layer density (`100k × density`), `Timber Camp` fells forest logs by `forestDensity`, `Clay Pit` (`10k` near water), `Quarry` (`50k`), and `Well` (scaled by `0.5 + 0.7 * territoryMoisture + 0.3 * tileMoisture`) produce continuously until storage fills or deposits reach `0`.
   - **Farming (`N/P/K`), Grain + Straw, Livestock Slaughter & Predators:** `Farmstead` (`seedReserve` vault guarding `grain` & edible Wild `roots`) caps adjacent `Crop Field` (`8×8` = `64` Spring-planted slots, `Grain` yielding both `grain` and `0.6× straw`, `N` Manure / `P` Bone Meal / `K` Wood Ash nutrients), `Animal Pen` (livestock capture + `Kill -1` slaughter), and `Orchard` (`9` Sapling slots). Forest operations risk `Wolf`/`Bear` encounters (`10%`/`4%`; Hunters and Barracks escorts slay predators cleanly for extra Meat, Bones & Pelts).
   - **Degradation, City Walls, Destruction & Abandonment:** Buildings start with a `3`-day grace buffer before decaying `2%/day` (`4%/day` in Winter, reduced up to `80%` inside active `City Wall` bounds or `Watchtower` `3×3` auras without stacking); players repair individually or via `Repair All`, safely demolish non-Main buildings, or relocate via **Start New Village** when average condition `< 20%`.
   - **`Market`, `Expedition Outpost`, Grouped Crafting & Continent Expeditions:** `Market` crafts `Caravan` (`1 donkey + 1 pop`, `150` bulk); `Expedition Outpost` trains `Scout` (`1 horse + 1 pop`); multi-recipe outputs share 1 `Craft` button (`via Ore` / `via Nuggets`), Continent expeditions scale by `distance × 25` Territory tiles, and smelting **`1 bronze_ingot`** triggers **`bronze_age`** (`Main` Tier 3).
5. **Stage 5 — Bronze Age Vertical Slice** *(Complete — v0.5.0)*
   - **Legacy Transition & Advanced Production (`Workshop`, `Smokehouse`, `Bronze Forge`, `Bloomery`):** `Workshop` (`Planks`, `Leather`, `Rope`, `Leather Armor`, `Saddle`); `Smokehouse & Kitchen` replaces `Firepit`/`Drying Rack` with `Bread` & smoked rations; `Bronze Forge` (`bronze_age` + `copper_hammer`) replaces `Kiln`/`Smithy` to craft ingots/vessels and research Bronze tools, bows/swords/shields, and Bronze Armor; `Bloomery Furnace` smelts `iron_ingot` to trigger **`iron_age`** (`Main` Tier 4).
   - **Military, Fortifications, Maritime `Port` & 2-Tab `Market`:** `Barracks` trains `Spearman`, `Swordsman`, `Archer` & saddled `Cavalry` with Option B batch Bronze refits; `Watchtower` (`3` pop) projects a yellow `3×3` protection aura; `Port` (`near_water`) fishes (`15/40/d`) and constructs `Fishing Boat` (`60` cargo) & `Transport Ship` (`400` cargo); `Market` separates **`1:1 Local Barter`** (Offline-safe) and **`Regional Caravan Trade`** (Sandbox distance-timed offers with resource escrow).
6. **Stage 6 — Backend Persistence, Iron & Steel Ages + The Obelisk** *(Next)*
   - Express/MongoDB sparse delta API, Socket.io live sync, BullMQ scheduled events, deep mining/blast furnace, conquest, and Obelisk exploration.

---

## 6. Domain Specifications & Player Guide
- [how_to_play.md](./docs/how_to_play.md)
- [architecture_spec.md](./docs/architecture_spec.md)
- [world_spec.md](./docs/world_spec.md)
- [building_spec.md](./docs/building_spec.md)
- [resource_spec.md](./docs/resource_spec.md)
