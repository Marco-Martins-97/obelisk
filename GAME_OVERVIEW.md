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
- **Capital (`7×7` grid):** A player may **upgrade** only **1** settlement to a `7×7` Capital.
- **Cities / Villages (`5×5` grid):** Players can hold multiple `5×5` settlements.
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
3. **Stage 3 — Stone Age Vertical Slice** *(Active)*
   - **Starter Spawn:** Central N-S band (`30%–70%`) across full W-E range with 1 pre-placed `MAIN` building (`tier: 1`, `level: 1`, `storage: 60/250` [`10 sticks`, `10 pelts`, `5 small_stones`, `5 berries` at `small: 2`], `pop: 0/10`, stored `food: 5`, `water: 5/10` bowls [`1 jar = 10 bowls`]) and starter **`wood_tools`** technology (`STARTER_UNLOCKED_TECHS`).
   - **`MAIN` Age Controller (`Tier 1..5`) vs. Building `Level` (`1..3`):** `MAIN` Tier controls the village Age (with storage/housing scaled by `MAIN` Level). Players may **downgrade `MAIN` Tier for free** to return to a prior Age; existing buildings keep their built Tier while new buildings spawn at current `MAIN` Tier, and higher-tier upgrades are blocked until `MAIN` advances again. Upgrading `MAIN` always consumes normal materials and builder time.
   - **Stone Age Buildings (`MAIN`, `FIREPIT`, `HOUSE`, `WAREHOUSE`, `DRYING_RACK`, `KILN`):** Timed construction (`outbound travel MAIN→tile + buildTime + return travel tile→MAIN`, `1 tile = 500m` / `0.5 km`) consuming basic materials (`sticks`, `pelts`, `straw`) for `MAIN`/`HOUSE`/`WAREHOUSE`/`DRYING_RACK` and stone (`small_stones`) for `FIREPIT`/`KILN`; `MAIN` levels also scale water storage (`+10` bowls/lv), `WAREHOUSE` adds `+250` pooled storage/lv, and `DRYING_RACK` & `KILN` require `stone_tools`.
   - **Unified Storage, FEFO Survival, Fractional Spoilage & Starvation Debuffs:** Active buildings pool village bulk capacity (`M1`), villagers automatically consume `1 food + 1 water bowl` per `popUsed`/day in **fastest-spoiling-first (`C1`/FEFO)** order, leftovers decay via per-type fractional spoilage carry (`S1`), salt comes from boiling water at `FIREPIT` (or future `limestone`/`shale` mining), and ration deficits trigger 5 debuff stages (**Hunger I/II/III → Sickness → Death** with balanced cross-role casualty trimming → **Abandoned Village** at `0` max pop), recovering `+20%` eff and `+10%` maxPop/day when fed.
   - **Stone Age Units (`gatherer`, `hunter`, `builder`):** Speed-based (`km/h`) solo or mixed teams (`Traveling → Working → Returning`, slowest unit speed) with probabilistic tile-specific yields across Fields, Water (including `1 jar` water collection by Gatherers or Hunters & non-flux/coal/salt ore panning), and Forest.
   - **Offline vs. Sandbox UI Split:** Sticky Top Navbar (`react-router`) switches between **Offline (`/`)** (speed locked at `6x`) and **Sandbox (`/sandbox`)** (with `1×–3600×` speed selector) plus a **How to Play** modal above a sticky Village Header Bar (showing debuff stage badge & stored food), full-size `672×672` **Territory ↔ Continent** map toggling, right-sidebar panels (fixed-height scrollable **Active Timers** showing real-time `Conclusion: HH:MM:SS` wall-clock end & remaining `HH:MM:SS` → **Units** → fixed-height scrollable **Stockpile** with spoilage rates & discard → **Unlocked Techs**), bottom **Village Log**, coordinate-only Offline hover tooltips, left-click `BuildingModal`, and right-click `[Gather 0 - 1 + All]` / `[Hunt 0 - 1 + All]` / `[Team >]` / `[Build >]` menus (`1px` black highlight).
   - **Technology Tree & Copper Age Trigger:** Tools live in the **Technology Tree** (`/shared/config/technologies.js`, player-persistent across claimed villages) and auto-apply the highest unlocked tier (`getBestUnlockedTool`): building `FIREPIT` unlocks researching **`stone_tools`** (`+20%` gather/hunt work speed, `+1` max loot, `-50%` empty roll weight; unlocks **`KILN`**), and smelting **`1 copper_ingot`** (`10 copper_nugget + 2 charcoal` at `KILN`) triggers **`copper_age`** to unlock upgrading **`MAIN` to Tier 2** (`{ small_stones: 8, sticks: 8, straw: 6, pelts: 4, clay: 6 }`, `4.0h`).
4. **Stage 4 — Copper Age**
   - Prospector teams & surface mines, copper tools/weapons, expanded storage and settlement perimeters.
5. **Stage 5 — Bronze Age**
   - Tin + copper alloying, bloomery & smithy, Tribal Wars-style marketplace and timed `sizeClass` caravans.
6. **Stage 6 — Iron & Steel Ages + The Obelisk**
   - Deep mining, blast furnace, distant world expeditions, settlement founding/conquest, and Obelisk exploration.

---

## 6. Domain Specifications & Player Guide
- [how_to_play.md](./docs/how_to_play.md)
- [architecture_spec.md](./docs/architecture_spec.md)
- [world_spec.md](./docs/world_spec.md)
- [building_spec.md](./docs/building_spec.md)
- [resource_spec.md](./docs/resource_spec.md)
