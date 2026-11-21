# Obelisk

> **An asynchronous, browser-based MMORTS** combining *Tribal Wars*-style world exploration and marketplace trading with *TerraFirmaCraft*-inspired geological scarcity, prospecting, and seasonal survival.

**Current Version:** `v0.1.0` *(Stages 0–2 Complete — Deterministic World/Territory Engine & Interactive Canvas Sandbox)*  
**Tech Stack:** React 19 · Vite 8 · Tailwind CSS v4 · Pure ES6+ ESM Workspaces · Vitest · ESLint *(Backend Stage 5+: Node.js, Express, MongoDB, Socket.io, BullMQ)*

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
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, water, forest canopies, and the Obelisk.
  - **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and dynamic per-ore layers), `10×` local contrast amplification on Territory gradients, an **Unbuildable (60% Red)** overlay toggle, and hex `tileSeed` inspection.

---

## Monorepo Structure

```text
Obelisk/
├── client/                  # @obelisk/client — React + Vite + Tailwind CSS v4
│   └── src/
│       ├── components/      # TerritoryCanvas, ContinentCanvas, MapControls, TileInspector
│       └── utils/           # mapViewport (frustum culling/zoom), mapColors, tileSprites
├── shared/                  # @obelisk/shared — Isomorphic ES6+ (zero Node/DOM APIs)
│   ├── config/              # worldConstants.js, worldGeology.js (ROCK_TYPES, ORES, BIOMES)
│   ├── generators/          # prng.js, noise.js, continentGenerator.js, territoryGenerator.js
│   └── tests/               # Vitest determinism, invariant, and speed benchmarks
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

# 2. Run all unit & UI component tests (24 tests across 6 suites)
npm test

# 3. Run ESLint across shared, client, and server
npm run lint

# 4. Launch the Stage 2 Map Visualizer locally
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
| **Stage 3** | Data-driven `createBuilding` factory, `7×7`/`5×5` grids, lazy degradation | Planned |
| **Stage 4** | Data-driven `createResource` factory, `sizeClass` bulk storage, lazy spoilage | Planned |
| **Stage 5** | Express API, MongoDB sparse deltas, auth, Fog of War enforcement (`/server`) | Planned |
| **Stage 6** | Socket.io live updates, BullMQ expeditions, prospecting & marketplace caravans | Planned |

See [GAME_OVERVIEW.md](./GAME_OVERVIEW.md) and [`docs/`](./docs/) for full specifications.

---

## Deploying `/client` (Vercel Free Tier)

Because `@obelisk/client` resolves `@obelisk/shared` via npm workspaces, configure Vercel at the **repository root**:
- **Root Directory:** `.`
- **Install Command:** `npm install`
- **Build Command:** `npm run build:client`
- **Output Directory:** `client/dist`
