# Obelisk

> **An asynchronous, browser-based MMORTS** combining *Tribal Wars*-style world exploration and marketplace trading with *TerraFirmaCraft*-inspired geological scarcity, prospecting, and seasonal survival.

**Current Version:** `v0.2.0` *(Stages 0–3 Complete — Stone Age Playable Vertical Slice, Tech Tree, Team Dispatch & Online/Sandbox UI)*  
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
  - Elevation bands (`Ocean < 0.38`, `Buildable Land 0.38–0.78`, `Mountain >= 0.78`).
  - North-to-south latitude temperature gradient with elevation cooling.
  - **Domain-Warped Voronoi Stone Provinces:** Guarantees all 7 stone types (`limestone`, `shale`, `granite`, `gabbro`, `basalt`, `slate`, `marble`) generate organically across the continent.
  - **1** deterministic Obelisk placed on a buildable land tile.
- **Territory (`generateTerritory`):**
  - Neighbor-interpolated elevation and temperature.
  - Local lakes and downhill rivers with a **minimum 1 water tile** (`spring` fallback) guarantee.
  - **Multi-Source BFS Moisture:** Computed from exact grid distance to local Territory water tiles.
  - **Rarity-Scaled Ore Prospecting:** Instead of pre-spawning ore nodes, each ore hosted by the tile's `rockType` generates an independent `[0, 1]` density field (`common` → broad veins, `very_rare` → small concentrated pockets) for prospector teams to triangulate.
  - **Guaranteed Forest & Settlement Zone:** Reserves a clear `7×7` central buildable footprint and guarantees `>= 1` forest tile.

### 4. High-Performance HTML5 Canvas Viewport (`/client`)
- **Viewport Frustum Culling (`getVisibleTileRange`):** Renders only on-screen tiles `+ 1` tile margin, keeping draw cost bounded by screen pixels regardless of map size, paired with clamped pan and cursor-anchored zoom.
- **Dual Map Modes:**
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, water, forest canopies, placed buildings (`BLD` while constructing), and team markers (`Blue` Gatherer, `Red` Hunter, `Orange` Mixed).
  - **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and dynamic per-ore layers), `10×` local contrast amplification on Territory gradients, an **Unbuildable (60% Red)** overlay toggle, and hex `tileSeed` inspection.

### 5. Stone Age Playable Loop, Tech Tree & Team Dispatch (`/shared` & `/client`)
- **`Online (/)` vs. `Sandbox (/sandbox)` Routes:** Sticky top `TopNavbar` (`react-router`) with `1×–3600×` speed control, sticky `VillageHeaderBar` (`Age · Main Tier · Level`, `World (x, y)`, `Storage`, `Food`, `Water`, `Pop`), full-size `672×672` **Territory ↔ Continent** map toggling, right-sidebar panels (**Active Timers → Units → Stockpile → Unlocked Technologies**), and bottom **Village Log**.
- **Strict Online Fog of War:** Territory starts at `7×7` explored and Continent starts at `1` village tile; Online hover tooltips show coordinates `(x, y)` only, while right-click tile commands (`1px` black outline) expand the `3×3` Fog frontier once returning teams/builders arrive back at `MAIN`.
- **`MAIN` Age Controller & Level Upgrades:** `MAIN` Tier (`1..5`) controls village Age (free downgrade / normal-material upgrade after `copper_age`), while building Levels (`1..3`) expand storage (`+250/lv`) and population capacity (`+10/lv`).
- **Player-Persistent Technology Tree ([shared/config/technologies.js](./shared/config/technologies.js)):** Tools (`wood_tools` → `stone_tools`) are researched permanently rather than stored in inventory, auto-applying the highest unlocked tier (`+20%` work speed, `+1` max loot, `-50%` empty roll weight).
- **Multi-Unit Team Dispatch & `HH:MM:SS` Phase Timers:** Right-click menus provide quick `[Gather 0 - 1 + All]`, `[Hunt 0 - 1 + All]`, `[Collect Water 0 - 1 + All]`, and `[Team >]` Smart Role Assignment marching at slowest unit speed across `Traveling → Working → Returning` phases.

---

## Monorepo Structure

```text
Obelisk/
├── client/                  # @obelisk/client — React 19 + React Router 8 + Vite + Tailwind v4
│   └── src/
│       ├── components/      # TopNavbar, VillageHud, TerritoryCanvas, ContinentCanvas, TileActionMenu, BuildingModal, MapControls, TileInspector
│       ├── hooks/           # useStoneAgeVillage (localStorage persistence & virtual time loop)
│       └── utils/           # mapViewport, mapColors, tileSprites, timeFormat
├── shared/                  # @obelisk/shared — Isomorphic ES6+ (zero Node/DOM APIs)
│   ├── config/              # worldConstants, worldGeology, resources, units, buildings, recipes, technologies
│   ├── generators/          # prng.js, noise.js, continentGenerator.js, territoryGenerator.js
│   ├── utils/               # stoneAgeMath.js (calendar, timers, yields, fog math, tech & tier rules)
│   └── tests/               # Vitest determinism, invariant, Stone Age, and benchmark suites
├── server/                  # @obelisk/server — Backend workspace (Stage 5+)
├── docs/                    # Tracked domain specifications
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

# 2. Run all unit & UI component tests (44 tests across 7 suites)
npm test

# 3. Run ESLint across shared, client, and server
npm run lint

# 4. Launch the client locally (Online + Sandbox views)
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
| **Stage 3** | Stone Age playable vertical slice, Tech Tree, Team dispatch, Fog UI & Online/Sandbox split | Complete (`v0.2.0`) |
| **Stage 4** | Copper & Bronze Ages: surface mines, tool splits, alloying, marketplace caravans | Planned |
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
