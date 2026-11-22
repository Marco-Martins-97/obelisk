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
- **Territory Exploration (`25×25`, `1 tile = 500m` [`0.5 km`]):** Starts with the central **`7×7`** revealed (viewport zoomed in to the explored area). Actions target an **already-explored (`1`) tile `x`** and upon completion reveal the **`3×3` box `[x-1..x+1, y-1..y+1]`** around `x` (`[[1,1,1],[1,1,1],[1,1,x]] → [[1,1,1,0],[1,1,1,1],[1,1,x,1],[0,1,1,1]]`), zooming out dynamically.
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
3. **Stage 3 — Stone Age Vertical Slice** *(Next)*
   - **Starter Spawn:** Central N-S band (`30%–70%`) across full W-E range with 1 pre-placed `MAIN` building (`storage: 50/100` [`10 sticks`, `10 pelts`, `5 small_stones` at `small: 2`], `pop: 0/10`, `food: 5`, `water: 5/10` bowls [`1 jar = 10 bowls`], starter `wood_tool`).
   - **Stone Age Buildings (Tier 1 Only, Level Upgradable — `MAIN`, `FIREPIT`, `HOUSE` +10 pop/lv max 3, `KILN`):** Timed construction (`outbound travel MAIN→tile + buildTime + return travel tile→MAIN`, `1 tile = 500m` / `0.5 km`) consuming materials, employing workers (`popUsed`), and locking `>= 1` `builder` until return.
   - **Stone Age Units (`gatherer`, `hunter`, `builder`):** Speed-based (`km/h`) round-trip actions with probabilistic tile-specific yields across Fields, Water (including `1 jar` water collection & non-flux/coal ore panning), and Forest.
   - **Online vs. Sandbox UI Split:** Top Navbar switches between **Sandbox (`/sandbox`)** and **Online (`/`)**—Online shows large Territory, small Continent, coordinate-only tooltips (no Dev/tile metrics), left-click building menu/timer (`"Building..."`), and right-click action menu (`red` = cannot build, `grey` = insufficient resources).
   - **Progression & Calendar:** Tool upgrade (`wood -> stone` at `FIREPIT`), lazy daily food/water survival per `popUsed`, Day/Night clock, `7×7 → 25×25` border-tile `3×3` reveal, and **Copper Age Evolution** (`10 copper_nuggets` → `1 copper_ingot` at `KILN`).
4. **Stage 4 — Copper Age**
   - Prospector teams & surface mines, copper tools/weapons, expanded storage and settlement perimeters.
5. **Stage 5 — Bronze Age**
   - Tin + copper alloying, bloomery & smithy, Tribal Wars-style marketplace and timed `sizeClass` caravans.
6. **Stage 6 — Iron & Steel Ages + The Obelisk**
   - Deep mining, blast furnace, distant world expeditions, settlement founding/conquest, and Obelisk exploration.

---

## 6. Domain Specifications
- [architecture_spec.md](./docs/architecture_spec.md)
- [world_spec.md](./docs/world_spec.md)
- [building_spec.md](./docs/building_spec.md)
- [resource_spec.md](./docs/resource_spec.md)
