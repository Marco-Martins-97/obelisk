# Obelisk

> **An asynchronous, browser-based MMORTS** combining *Tribal Wars*-style world exploration and marketplace trading with *TerraFirmaCraft*-inspired geological scarcity, prospecting, and seasonal survival.

**Current Version:** `v0.6.0` *(Stages 0–6 Complete — Stone, Copper, Bronze & Iron Age Vertical Slices, Evolving Multi-Tier Buildings, 50 Continent Ruins & Blueprints, Windmill/Watermill Auto-Crafting, Colonization, Abandoned Village Conquest & 1-Capital Rule)*  
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
  - **1** deterministic Obelisk and **50** deterministic Ruins (`isRuin`) placed on buildable land tiles.
- **Territory (`generateTerritory`):**
  - Neighbor-interpolated elevation (`>= SEA_LEVEL` floor enforced on all land territories so coastlines remain cleanly buildable) and temperature.
  - Local lakes and downhill rivers with a **minimum 1 water tile** (`spring` fallback) guarantee, plus **rarity & host-rock weighted ore nugget panning** (`2×` bonus when present in the local `rockType`; excludes `flux`, `coal`, `salt`).
  - **Multi-Source BFS Moisture & Guaranteed `7×7` Settlement Zone:** Guarantees at least 1 buildable forest tile on the immediate `9×9` ring adjacent to the `7×7` starter zone.

### 4. High-Performance HTML5 Canvas Viewport (`/client`)
- **Viewport Frustum Culling (`getVisibleTileRange`):** Renders only on-screen tiles `+ 1` tile margin, keeping draw cost bounded by screen pixels regardless of map size, paired with clamped pan and cursor-anchored zoom.
- **Dual Map Modes:**
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, water, forest canopies, Ruin markers, yellow overlays across Age-scaled City footprints (`0 / 1×1 / 3×3 / 5×5 / 7×7`) and `Watchtower` (`3×3`) auras, tier-colored outer `City Wall` borders (`Wood`/`Stone`/`Brick`), distinct building badges (`BUILDING_COLORS` across Stone through Iron structures; `BLD` while constructing), and team markers (`Blue` Gatherer, `Red` Hunter, `Orange` Mixed).
  - **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and dynamic per-ore layers), `10×` local contrast amplification on Territory gradients, an **Unbuildable (60% Red)** overlay toggle, and hex `tileSeed` inspection.

### 5. Stone, Copper, Bronze & Iron Age Playable Loop, Survival & Offline Mode (`/shared` & `/client`)
- **`Offline (/)` vs. `Sandbox (/sandbox)` Routes:** Sticky top `TopNavbar` (`react-router`) switches between **Offline (`/`)** (fixed `6×` simulation speed until the backend server releases, with in-game Celsius temperature and a built-in **How to Play** modal) and **Sandbox (`/sandbox`)** (`1×–3600×` speed selector, **`+ Spawn Colony`** & Territory Switcher, Dev overlays, **Unlock Map** / **Unlock Continent**, **`+1 Day`/`+1 Month`/`+1 Year`** time jumps, and **Add Resource** cheat controls).
- **Real-Time Timers (`HH:MM:SS`), Sequential Building Queues & Waiting Cancel Safeguard:** Sticky status header colors `Storage`/`Pop` (`>90%` orange, `100%` red) and `Food`/`Water` by active `popUsed` ration days (`< 1 day` red, `< 3 days` orange). Right sidebar displays **Production (`/day`) → Units** (white unit names, color-coded `{free}/{total}` counters, idle `-1` dismissal) **→ Active Timers** (`Conclusion: HH:MM:SS`, phase badge `Queued`/`Traveling`/`Working`/`Returning` + countdown, and **`Cancel`**). Crafting and Unit Training inside a building execute sequentially **1 item/unit at a time** with consecutive same-item stacking, upfront resource deduction, `10%` cancellation on the active 1st item, and full refund (`Cancel Queued`) for waiting items `2..N`.
- **Strict Fog of War:** Territory starts at `7×7` explored and Continent starts at `1` village tile; Offline hover tooltips show coordinates `(x, y)` only, expanding the `3×3` frontier once returning teams/builders arrive back at `MAIN`.
- **`MAIN` Age Controller & Evolving Multi-Tier Buildings:** `MAIN` Tier (`1..5`) controls village Age, while Buildings construct at their base unlock Tier (`def.tier`) and evolve Tier-by-Tier directly from any level (`House` `Tent`→`Brick House`, `Warehouse` `Storage Pit`→`Brick Warehouse`, `Firepit` `T1`→`T4`, `Kiln` `T1`→`T4 Blast Furnace`, `Smithy` `T2`→`T4 Iron Blacksmith`, `Watchtower` `T3`→`T5`).
- **FEFO Auto-Feeding, Fractional Spoilage (`S1`), Salt & 5-Stage Starvation Debuffs:** Active `popUsed` consumes `1 food + 1 water bowl` per day automatically in **fastest-spoiling-first (`FEFO`)** order with multi-ration `foodCarry`; leftovers accumulate per-type fractional spoilage (`spoilageCarry`). Deficits progress through **Hunger I (-10%) → Hunger II (-30%) → Hunger III (-50%) → Sickness (-80%) → Death (-80% + -10% maxPop/day)** with balanced highest-pop whole-unit casualties until **Abandoned** at `0` maxPop, recovering **`+20%` efficiency** and **`+10%` maxPop/day** when fed.
- **Iron Age Techs, Ruins, Mills, Colonization & Conquest ([shared/utils/copperAgeMath.js](./shared/utils/copperAgeMath.js)):**
  - **Iron Metallurgy & Units:** All `9` tool branches upgrade to Iron alongside `iron_sword`, `iron_shield`, `iron_armor`, `longbow`, Blueprint-gated `crossbow` (`Archer` T5 refit), Coal/Charcoal smelting variants, `steel_ingot` (`steel_age`), `Knight`, `Heavy Wagon`, and `Merchant Ship`.
  - **50 Ruins & Automated Mills:** Continent expeditions loot `50` Ruins repeatedly for treasure and max `1` of each Blueprint (`blueprint_crossbow`, `blueprint_windmill`, `blueprint_watermill`); `Windmill` (`50%–150%` elevation scaling) and `Watermill` (`100%` steady) rotate **1 craft at a time** across `1–3` configured slots with upfront resource deduction.
  - **Colonization, Abandoned Conquest & 1-Capital Rule:** Settlers (`1 Builder`, `>= 100` haul, starter bundle, `2×` rations) colonize empty tiles at **Copper Age** (`MAIN` Tier 2) with all global techs/blueprints unlocked; `>= 1 Knight` (consumed on victory) + squad attack conquer Bandit-held Abandoned Villages; manual `MAIN` Tier 5 (`7×7` Capital) upgrades are capped at `1` per player while conquered Capitals retain Tier 5.

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

# 2. Run all unit & UI component tests (75 tests across 7 suites)
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
| **Stage 4** | Copper Age: Smithy 6-tool split, fractional tier-level scaling, Prospector, continuous deposits & Well moisture scaling, `N/P/K` farming (`Grain` + `Straw`) & Animal slaughter, Vessels/Baskets, Building Degradation & Repair/Abandonment, Right-click Quick Actions & Destroy Building, Wolf/Bear encounters, Real-time `HH:MM:SS` timers, Idle Unit Dismissal & Bronze Age trigger | Complete (`v0.4.0`) |
| **Stage 5** | Bronze Age vertical slice (`Watchtower` `3×3` aura, `Port`, `Barracks` Option B refits, 2-tab `Market` + Sandbox `+ Spawn Colony`), dynamic City/Wall canvas overlays, timed recruitment, HUD thresholds & `10%` task cancellation | Complete (`v0.5.0`) |
| **Stage 6** | Iron Age vertical slice: evolving multi-tier buildings, `50` Ruins & Blueprints, Windmill/Watermill auto-crafting, Coal & Steel smelting (`steel_age`), Iron tools/`longbow`/`crossbow`, `Knight`/`Heavy Wagon`/`Merchant Ship`, Colonization, Abandoned Village Conquest & 1-Capital rule | Complete (`v0.6.0`) |
| **Stage 7** | Steel Age vertical slice (`/shared` + `/client`) | Next |
| **Stage 8** | Express API, MongoDB sparse deltas, Socket.io live sync, BullMQ expeditions, Multiplayer PvP Conquest & The Obelisk (`/server`) | Planned |

See [GAME_OVERVIEW.md](./GAME_OVERVIEW.md) and [`docs/`](./docs/) for full specifications.

---

## Deploying `/client` (Vercel Free Tier)

Because `@obelisk/client` resolves `@obelisk/shared` via npm workspaces, configure Vercel at the **repository root**:
- **Root Directory:** `.`
- **Install Command:** `npm install`
- **Build Command:** `npm run build:client`
- **Output Directory:** `client/dist`
