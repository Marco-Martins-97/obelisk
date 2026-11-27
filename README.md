# Obelisk

> **An asynchronous, browser-based MMORTS** combining *Tribal Wars*-style world exploration and marketplace trading with *TerraFirmaCraft*-inspired geological scarcity, prospecting, and seasonal survival.

**Current Version:** `v0.4.0` *(Stages 0–4 Complete — Stone & Copper Age Vertical Slices, Degradation & Repair, N/P/K Farming, Vessels/Baskets, Combat Encounters, Real-Time `HH:MM:SS` Timers & Unit Dismissal)*  
**Platform Note:** Built for **Desktop web browsers** (left/right-click context menus, tile hover tooltips, and scroll-wheel map zoom); some interactions do not work on phones or small touch screens yet.  
**Tech Stack:** React 19 · React Router 8 · Vite 8 · Tailwind CSS v4 · Pure ES6+ ESM Workspaces · Vitest · ESLint *(Backend Stage 5+: Node.js, Express, MongoDB, Socket.io, BullMQ)*

---

## Key Engineering Highlights

### 1. Strict Seeded Determinism (Zero `Math.random()`)
- Enforced at the linter level (`eslint.config.js` bans `Math.random()` inside `shared/generators/**`).
- Custom **Mulberry32** PRNG, **FNV-1a** string hashing, and **Murmur-style** coordinate bit-mixing (`hashCoords`) in [shared/generators/prng.js](./shared/generators/prng.js).
- Zero-dependency **2D Perlin Gradient Noise** and multi-octave **fBm** in [shared/generators/noise.js](./shared/generators/noise.js).
- Guarantees byte-for-byte identical `100×100` Continents and `25×25` Territories across both `/client` and `/server`.

### 2. Zero Terrain Bloat (`25×` Scale Law)
- A `100×100` Continent expands into `10,000 × 625 = 6,250,000` Territory sub-tiles. Instead of bulk-storing static terrain in a database, the server holds the Continent in memory and derives each tile's `tileSeed = hashCoords(masterWorldSeed, x, y)` on demand.
- **Fog-of-War-Safe Neighbor Interpolation:** `getWorldTileContext()` extracts only scalar summaries (`elevation`, `temperature`, `moisture`, `rockType`, `biome`) from cardinal neighbors—never neighboring `tileSeed`s—allowing territories to blend smoothly across borders without leaking unexplored map data.

### 3. Procedural Geology, Hydrology & Prospecting
- **Continent (`generateContinent`):**
  - Full-range `[0, 1]` rescaled elevation & moisture fields (`Ocean < 0.38`, `Buildable Land 0.38–0.78`, `Mountain >= 0.78`) and **Celsius ambient temperature (`-20°C` to `+40°C`)** adjusted by latitude, elevation, season, and day/night.
  - **Domain-Warped Voronoi Stone Provinces:** Guarantees all 7 stone types (`limestone`, `shale`, `granite`, `gabbro`, `basalt`, `slate`, `marble`, plus Copper Age `salt` in `limestone`/`shale`) generate organically across the continent.
  - **1** deterministic Obelisk placed on a buildable land tile.
- **Territory (`generateTerritory`):**
  - Neighbor-interpolated elevation (`>= SEA_LEVEL` floor enforced on all land territories so coastlines remain cleanly buildable) and temperature.
  - Local lakes and downhill rivers with a **minimum 1 water tile** (`spring` fallback) guarantee, plus **rarity & host-rock weighted ore nugget panning** (`2×` bonus when present in the local `rockType`; excludes `flux`, `coal`, `salt`).
  - **Multi-Source BFS Moisture & Guaranteed `7×7` Settlement Zone:** At least 1 forest tile preserved outside the starter center.

### 4. High-Performance HTML5 Canvas Viewport (`/client`)
- **Viewport Frustum Culling (`getVisibleTileRange`):** Renders only on-screen tiles `+ 1` tile margin, keeping draw cost bounded by screen pixels regardless of map size, paired with clamped pan and cursor-anchored zoom.
- **Dual Map Modes:**
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, water, forest canopies, placed buildings (`BLD` while constructing), and team markers (`Blue` Gatherer, `Red` Hunter, `Orange` Mixed).
  - **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and dynamic per-ore layers), `10×` local contrast amplification on Territory gradients, an **Unbuildable (60% Red)** overlay toggle, and hex `tileSeed` inspection.

### 5. Stone & Copper Age Playable Loop, Survival, Storage & Offline Mode (`/shared` & `/client`)
- **`Offline (/)` vs. `Sandbox (/sandbox)` Routes:** Sticky top `TopNavbar` (`react-router`) switches between **Offline (`/`)** (fixed `6×` simulation speed until the backend server releases, with in-game Celsius temperature and a built-in **How to Play** modal) and **Sandbox (`/sandbox`)** (`1×–3600×` speed selector, Dev overlays, **Unlock Map** / **Unlock Continent**, **`+1 Day`/`+1 Month`/`+1 Year`** time jumps, and **Add Resource** cheat controls).
- **Real-Time Timers (`HH:MM:SS`), Header Modals & Active-While-Upgrading UI:** Right sidebar displays **Production (`/day`) → Units (`Free / Total` with idle `-1` dismissal) → Active Timers** (`Conclusion: HH:MM:SS` wall-clock end and remaining `HH:MM:SS`), while all build/upgrade/craft/research durations also display in speed-scaled `HH:MM:SS`. **Stockpile** (category tabs + left-click item card menu), **Technologies**, and **Village Log** open as Header modals. Crafting groups multi-recipe products (`via Ore` / `via Nuggets`) under one `Craft` button with batch quantities (`-`/`+`/`Max`), `have/needed Resource` costs (`CostInline`, missing highlighted red), and active-while-upgrading buildings.
- **Strict Fog of War:** Territory starts at `7×7` explored and Continent starts at `1` village tile; Offline hover tooltips show coordinates `(x, y)` only, expanding the `3×3` frontier once returning teams/builders arrive back at `MAIN`.
- **`MAIN` Age Controller, Buildings & Material Split:** `MAIN` Tier (`1..5`) controls village Age, while Levels (`1..3`) scale pooled storage (`+250/lv`), population (`+10/lv`), and `MAIN` water storage (`10 / 25 / 50` bowls across Lv `1..3`). Basic structures (**Main**, **House**, **Warehouse**, **Drying Rack**) use basic materials (`sticks`, `pelts`, `straw`), while **Firepit** and **Clay Kiln** require `small_stones`.
- **FEFO Auto-Feeding, Fractional Spoilage (`S1`), Salt & 5-Stage Starvation Debuffs:** Active `popUsed` consumes `1 food + 1 water bowl` per day automatically in **fastest-spoiling-first (`FEFO`)** order with multi-ration `foodCarry`; leftovers accumulate per-type fractional spoilage (`spoilageCarry`). **Firepit** boils water into **Salt** (`2 sticks + 10 water bowls -> 2 salt`) for **Drying Rack** cured rations (`1–6%/d` spoil). Deficits progress through **Hunger I (-10%) → Hunger II (-30%) → Hunger III (-50%) → Sickness (-80%) → Death (-80% + -10% maxPop/day)** with balanced highest-pop whole-unit casualties until **Abandoned** at `0` maxPop, recovering **`+20%` efficiency** and **`+10%` maxPop/day** when fed.
- **Technology Tree & Copper Age Mechanics ([shared/config/technologies.js](./shared/config/technologies.js)):** Tools (`wood_tools` → `stone_tools` → Smithy 6-branch tools `axe`, `pickaxe`, `hoe`, `spear`, `shovel`, `hammer` + Copper upgrades) persist across settlements, alongside `[Research] -> [Craft]` storage unlocks (**Woven Baskets** `+15` general bulk, **Clay Vessels** `+10` water & `+20` preserved food at `0.7×` spoilage).
- **Copper Age Production, `N/P/K` Farming, Degradation & Encounters (`/shared/utils/copperAgeMath.js`):**
  - **Prospecting & Continuous Deposits:** `Prospector` surveys tiles; `Mine`, `Timber Camp`, `Quarry`, `Clay Pit`, and moisture-scaled `Well` (`0.5 + 0.7×territoryMoisture + 0.3×tileMoisture`) produce daily until deposits empty or storage fills.
  - **`N/P/K` Crop Fields, Orchards & Animal Pens:** `Farmstead` guards seeds and attaches `Crop Field` (`N` Nitrogen via `Manure`, `P` Phosphorus via `Bone Meal`, `K` Potassium via Firepit/Kiln `Wood Ash`), `Orchard`, and `Animal Pen` (Hunters capture horses/donkeys/goats/sheep/chickens; `Kill -1` butchers Meat/Bones/Pelts).
  - **Degradation, Right-Click Quick Actions & Relocation:** Active buildings have a `3`-day grace buffer before decaying `2%/day` (`4%/day` in Winter, reduced up to `80%` by internal `City Wall`), with `Repair` / `Repair All`, right-click Building Quick Action menus (`Open`, `Repair`, `Quick Harvest`, `Quick Craft`, `Upgrade`, guarded `Destroy Building`), forest `Wolf`/`Bear` encounters, Continent Expeditions, and **Start New Village** relocation when average condition drops `< 20%` (leaving `Abandoned` markers on the Continent).

---

## Monorepo Structure

```text
Obelisk/
├── client/                  # @obelisk/client — React 19 + React Router 8 + Vite + Tailwind v4
│   └── src/
│       ├── components/      # TopNavbar, VillageHud, TerritoryCanvas, ContinentCanvas, TileActionMenu, BuildingModal, CopperAgeBuildingPanels, ContinentExpeditionModal, CostInline, MapControls, TileInspector
│       ├── hooks/           # useStoneAgeVillage (localStorage persistence & virtual time loop)
│       └── utils/           # mapViewport, mapColors, tileSprites, timeFormat
├── shared/                  # @obelisk/shared — Isomorphic ES6+ (zero Node/DOM APIs)
│   ├── config/              # worldConstants, worldGeology, resources, units, buildings, recipes, technologies, farming
│   ├── generators/          # prng.js, noise.js, continentGenerator.js, territoryGenerator.js
│   ├── utils/               # stoneAgeMath.js, copperAgeMath.js (calendar, timers, yields, fog math, farming, continuous production, expeditions)
│   └── tests/               # Vitest determinism, invariant, Stone Age, and benchmark suites
├── server/                  # @obelisk/server — Backend workspace (Stage 5+)
├── docs/                    # Tracked domain specifications & player guide
│   ├── how_to_play.md
│   ├── architecture_spec.md
│   ├── world_spec.md
│   ├── building_spec.md
│   └── resource_spec.md
├── GAME_OVERVIEW.md         # Master vision & staged roadmap
└── eslint.config.js         # Flat ESLint config enforcing generator determinism
```

---

## Local Development & Verification

**Prerequisites:** Node.js `>= 22 LTS` and `npm >= 10`.

```bash
# 1. Install workspace dependencies from the repository root
npm install

# 2. Run all unit & UI component tests (64 tests across 7 suites)
npm test

# 3. Run ESLint across shared, client, and server
npm run lint

# 4. Launch the client locally (Offline + Sandbox views)
npm run dev:client

# 5. Build production frontend bundle
npm run build:client
```

---

## Roadmap

| Stage | Scope | Status |
| :--- | :--- | :--- |
| **Stage 0** | Monorepo workspaces, Vitest, ESLint (`Math.random` ban), Vite + Tailwind v4 | Complete |
| **Stage 1** | Deterministic `100×100` Continent & `25×25` Territory generators (`/shared`) | Complete |
| **Stage 2** | Interactive Gameplay/Dev Canvas Map Visualizer & frustum culling (`/client`) | Complete |
| **Stage 3** | Stone Age survival vertical slice: Tech Tree, Warehouse, Drying Rack, Salt, FEFO/Spoilage, Debuffs & Offline/Sandbox UI | Complete (`v0.3.0`) |
| **Stage 4** | Copper Age: Smithy 6-tool split, fractional tier-level scaling, Prospector, continuous deposits & Well moisture scaling, `N/P/K` farming & Animal slaughter, Vessels/Baskets, Building Degradation & Repair/Abandonment, Right-click Quick Actions & Destroy Building, Wolf/Bear encounters, Real-time `HH:MM:SS` timers, Idle Unit Dismissal & Bronze Age trigger | Complete (`v0.4.0`) |
| **Stage 5** | Bronze Age vertical slice (metallurgy, Bronze tools/units, regional logistics) | Next |
| **Stage 6** | Express API, MongoDB sparse deltas, Socket.io live sync, BullMQ expeditions, Iron/Steel Ages & The Obelisk (`/server`) | Planned |

See [GAME_OVERVIEW.md](./GAME_OVERVIEW.md) and [`docs/`](./docs/) for full specifications.

---

## Deploying `/client` (Vercel Free Tier)

Because `@obelisk/client` resolves `@obelisk/shared` via npm workspaces, configure Vercel at the **repository root**:
- **Root Directory:** `.`
- **Install Command:** `npm install`
- **Build Command:** `npm run build:client`
- **Output Directory:** `client/dist`
