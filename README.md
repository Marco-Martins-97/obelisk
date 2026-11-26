# Obelisk

> **An asynchronous, browser-based MMORTS** combining *Tribal Wars*-style world exploration and marketplace trading with *TerraFirmaCraft*-inspired geological scarcity, prospecting, and seasonal survival.

**Current Version:** `v0.3.0` *(Stages 0–3 Complete — Stone Age Survival, Storage Pooling, Drying/Salt, Debuffs, Offline 6× Mode & Guide)*  
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

### 5. Stone Age Playable Loop, Survival, Storage & Offline Mode (`/shared` & `/client`)
- **`Offline (/)` vs. `Sandbox (/sandbox)` Routes:** Sticky top `TopNavbar` (`react-router`) switches between **Offline (`/`)** (fixed `6×` simulation speed until the backend server releases, with in-game Celsius temperature and a built-in **How to Play** modal) and **Sandbox (`/sandbox`)** (`1×–3600×` speed selector, Dev overlays, **Unlock Map** / **Unlock Continent**, **`+1 Day`/`+1 Month`/`+1 Year`** time jumps, and **Add Resource** cheat controls).
- **Sidebar Layout, Header Modals & Active-While-Upgrading UI:** Right sidebar displays **Production (`/day`) → Units (`Free / Total`) → Active Timers** (real-time `Conclusion: HH:MM:SS` wall-clock timestamps and remaining countdowns); **Stockpile** (category tabs + left-click item card menu), **Technologies**, and **Village Log** open cleanly as Header modals. Crafting supports batch quantities (`-`/`+`/`Max`), missing costs render in red (`CostInline`), upgrade cards show exact stat improvements, and buildings remain active while upgrading.
- **Strict Fog of War:** Territory starts at `7×7` explored and Continent starts at `1` village tile; Offline hover tooltips show coordinates `(x, y)` only, expanding the `3×3` frontier once returning teams/builders arrive back at `MAIN`.
- **`MAIN` Age Controller, Buildings & Material Split:** `MAIN` Tier (`1..5`) controls village Age, while Levels (`1..3`) scale pooled storage (`+250/lv`), population (`+10/lv`), and `MAIN` water storage (`10 / 25 / 50` bowls across Lv `1..3`). Basic structures (**Main**, **House**, **Warehouse**, **Drying Rack**) use basic materials (`sticks`, `pelts`, `straw`), while **Firepit** and **Clay Kiln** require `small_stones`.
- **FEFO Auto-Feeding, Fractional Spoilage (`S1`), Salt (`Salt-A`) & 5-Stage Starvation Debuffs:** Active `popUsed` consumes `1 food + 1 water bowl` per day automatically in **fastest-spoiling-first (`FEFO`)** order with multi-ration `foodCarry`; leftovers accumulate per-type fractional spoilage (`spoilageCarry`). **Firepit** boils water into **Salt** (`2 sticks + 10 water bowls -> 2 salt`) for **Drying Rack** cured rations (`1–6%/d` spoil). Ration deficits progress through **Hunger I (-10%) → Hunger II (-30%) → Hunger III (-50%) → Sickness (-80%) → Death (-80% + -10% maxPop/day)** with balanced highest-pop whole-unit casualties until **Abandoned** at `0` maxPop, recovering **`+20%` efficiency** and **`+10%` maxPop/day** when fed.
- **Player-Persistent Technology Tree ([shared/config/technologies.js](./shared/config/technologies.js)):** Tools (`wood_tools` → `stone_tools`) are researched permanently rather than stored in inventory, auto-applying `+20%` work speed, `+1` max loot, and `-50%` empty roll weight.

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

# 2. Run all unit & UI component tests (59 tests across 7 suites)
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
| **Stage 4** | Copper Age: Smithy 6-tool split, fractional tier-level scaling, Prospector, continuous production, Farmstead/Crop Fields/Orchards/Livestock, Walls, Market (`1:1`), Continent Expeditions & Bronze Age trigger | Active (`in dev`) |
| **Stage 5** | Express API, MongoDB sparse deltas, auth, authoritative Fog of War enforcement (`/server`) | Planned |
| **Stage 6** | Socket.io live sync, BullMQ expeditions, Iron/Steel Ages & The Obelisk | Planned |

See [GAME_OVERVIEW.md](./GAME_OVERVIEW.md) and [`docs/`](./docs/) for full specifications.

---

## Deploying `/client` (Vercel Free Tier)

Because `@obelisk/client` resolves `@obelisk/shared` via npm workspaces, configure Vercel at the **repository root**:
- **Root Directory:** `.`
- **Install Command:** `npm install`
- **Build Command:** `npm run build:client`
- **Output Directory:** `client/dist`
