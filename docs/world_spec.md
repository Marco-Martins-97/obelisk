# World & Territory Specification (Stages 1 & 2)

## 1. World Hierarchy, Distance Scale & The `25×` Scale Law
- **Continent (World Map):** Configurable `N × N` grid (default `100 × 100` = `10,000` world tiles, coordinates `(0,0)` to `(99,99)`; `1 continent tile = 12.5 km × 12.5 km`).
- **Territory (Regional Zone):** Each world tile expands into a configurable `M × M` regional grid (default `25 × 25` = `625` sub-tiles, coordinates `(0,0)` to `(24,24)`; **`1 territory sub-tile = 500m` (`0.5 km`)**).
- **Seed Derivation:**
  - Server holds `masterWorldSeed` (secret).
  - Each world tile derives `tileSeed = hashCoords(masterWorldSeed, x, y)`.
  - Only scouted/claimed `tileSeed` values are sent to `/client` (alongside Fog-of-War-safe scalar neighbor summaries).

---

## 2. Stage 1 — Deterministic Generators (`/shared/generators/`)

### Continent Generator (`continentGenerator.js`)
Generates the `N×N` world map from `masterWorldSeed` using multi-octave seeded 2D gradient noise (fBm):
- **Elevation:** Ocean (`< 0.38`), buildable land (`0.38`–`0.78`), and mountains (`>= 0.78`). **No rivers** are generated at the continent level.
- **Temperature:** North-to-south latitude gradient (north colder than south) + elevation cooling + noise jitter.
- **Moisture:** Noise-driven regional humidity (used for continent biomes and territory river prevalence).
- **Single-Layer Rock Strata (TFC-inspired):** Seeded, domain-warped Voronoi provinces guaranteeing all 7 stone types (`limestone`, `shale`, `granite`, `gabbro`, `basalt`, `slate`, `marble`) generate across the continent.
- **Biomes:** Derived from `(elevation, temperature, moisture)` lookup matrix (`classifyBiome`).
- **The Obelisk & 50 Ruins:** Exactly **1** unique Obelisk tile (`isObelisk: true`) plus **50** deterministic Ruins (`isRuin: true`) placed on buildable non-Obelisk land tiles. Ruins can be looted repeatedly for treasure and yield up to **1** of each unique Blueprint (`blueprint_crossbow`, `blueprint_windmill`, `blueprint_watermill`).

### Territory Generator (`territoryGenerator.js`)
Generates an `M×M` regional grid from `(tileSeed, worldTileContext)`:
- **Neighbor Interpolation:** Smoothly interpolates `elevation` and `temperature` from the center tile and its cardinal continent neighbors (`north`, `south`, `east`, `west`), plus local micro-noise.
- **Water (Lakes, Rivers & Minimum Guarantee):** Carves local lakes and downhill streams, guaranteeing **at least 1 water tile** (`spring` fallback) per territory.
- **Water-Driven Moisture:** Computed via multi-source BFS distance from Territory water tiles (`isWater`).
- **Forest Layer:** Territory-only `forestDensity` (`0.0`–`1.0`) guaranteeing **at least 1 forest tile** (`>= 0.52`) outside water and the settlement zone.
- **Per-Ore Prospecting Layers:** No pre-spawned ore nodes; instead, each ore hosted by the parent tile's `rockType` gets an independent `ores[oreId]` (`0.0`–`1.0`) density field scaled by ore rarity (`common` → broader veins, `very_rare` → tiny concentrated pockets).
- **Settlement Zone & Spawn Rules:**
  - Reserves a dry, forest-free central `7×7` buildable pad (`inSettlementZone`) at terrain generation time so settlements can expand safely up to `Steel` Tier without hitting lakes or forests.
  - Active rendered/fortified City bounds scale with `Main Village Hall` Tier (`CITY_SIZE_BY_MAIN_TIER`: `Stone = 0`, `Copper = 1×1`, `Bronze = 3×3`, `Iron = 5×5`, `Steel = 7×7`).
  - **Player Starter Spawn:** New players spawn in the **central N-S latitude band** (`30%–70%`) across the **full W-E longitude range**, strictly on `buildable` non-Obelisk continent tiles.
  - **Terrain Categories for Stone Age Units:** Territory sub-tiles fall into **Water** (`isWater`), **Forest** (`forestDensity >= 0.52`), or **Fields** (dry open land) for `gatherer` and `hunter` yields.

### Stage 1 Verification Gate (Vitest)
- Identical seed produces byte-for-byte identical `100×100` and `25×25` outputs.
- Boundary coordinates `(0,0)` and `(99,99)` / `(24,24)` execute without out-of-bounds errors.
- Exactly 1 Obelisk tile exists on a buildable continent tile; all 7 stone types generate; every territory has `>= 1` water tile, `>= 1` forest tile, and a clear `7×7` settlement zone.
- Fast generation benchmark (`<50ms` for full continent, `<5ms` per territory).

---

## 3. Stage 2 & 3 — Map Viewport Split (`Online` vs. `Sandbox`) & Exploration Zoom
A sticky Top Navbar (`react-router`) switches between **Online (`/`)** and **Sandbox (`/sandbox`)** with a local speed selector (`1×`–`3600×`, default `6×`) and a sticky **Village Header Bar** (`Age · Main Tier · Level`, `World (x, y)`, `Storage`, `Food`, `Water`, `Pop`) anchored directly underneath:
- **Sandbox (`/sandbox`):** Localhost-persisted Dev Visualizer & playable village sandbox:
  - **Primary Map (`672×672` Territory ↔ Continent Toggle):** Switches the full-size `672×672` interactive canvas between Territory Terrain and Continent Map (`50px` zoomable tiles, `1px` `#000000` selected tile outline, optional **Fog of War** toggle).
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, lakes/rivers/springs, forest canopies, yellow overlays across both active Age-scaled City footprints (`0 / 1×1 / 3×3 / 5×5 / 7×7`) and `Watchtower` (`3×3`) protection zones, tier-colored outer `City Wall` borders (Wood `#b45309`, Stone `#e2e8f0`, Brick `#f59e0b`) when `wall.level > 0`, distinct building badges/colors (`BUILDING_COLORS` in `mapColors.js` for all Stone, Copper, and Bronze structures; `BLD` while constructing), and team markers (`Blue` Gatherer, `Red` Hunter, `Orange` Mixed).
  - **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and per-ore `Ores` layers) with `10×` local contrast on Territory elevation/temperature, an **Unbuildable (60% Red)** overlay toggle, `tileSeed` inspector (`TileInspector`), and live `seed` / grid size controls.
  - **Right Sidebar & Bottom Footer:** Displays `TileInspector` above four stacked container cards (**Active Timers** with `(x, y) Team (...)` and `Conclusion: HH:MM:SS` + `Traveling / Working / Returning HH:MM:SS` → **Units** → **Stockpile** with Eat & discard controls → **Unlocked Technologies**), plus a full-width **Village Log** footer.
- **Online (`/`):** Gameplay-only UI with strict Fog of War & information hiding:
  - **Full-Size Map View (`Territory ↔ Continent` Toggle):** Uses the full `672×672` canvas for both the home `25×25` Territory and `100×100` Continent views (removing any embedded mini-map so **Active Timers → Units → Stockpile → Unlocked Technologies** sit at the top of the right sidebar, with the **Village Log** at the bottom).
  - **No Dev Info / No Tile Metrics:** Hovering/inspecting tiles displays coordinates `(x, y)` only (no elevation/moisture/ore percentages or `tileSeed`).
  - **Left-Click:** Selects a building—shows `"Building..."` + countdown if under construction, or opens the Building Menu (`MAIN` trains units + upgrades Level/Tier, `FIREPIT` cooks & researches `stone_tools`, `KILN` smelts `copper_ingot`).
  - **Right-Click:** Highlights the tile with a `1px` black outline and opens `[Gather 0 - 1 + All]`, `[Hunt 0 - 1 + All]`, `[Collect Water 0 - 1 + All]` (on water), `[Team >]` (Smart Role Assignment mixing Gatherers/Hunters/Water), and `[Build >]` (`ready`, `grey` insufficient resources, `red` blocked/locked).
  - **Progressive Exploration & Auto-Zoom:**
    - **Territory (`25×25`, `1 tile = 500m` [`0.5 km`]):** Starts with central **`7×7`** revealed and zoomed in. Actions target an already-explored (`1`) tile `x` and **upon the team/builder returning to `MAIN`** reveal the **`3×3` area** around `x` (`[[1,1,1],[1,1,1],[1,1,x]] → [[1,1,1,0],[1,1,1,1],[1,1,x,1],[0,1,1,1]]`), zooming out dynamically to fit explored bounds.
    - **Continent (`100×100`, `1 tile = 12.5 km`):** Starts with **`1` tile** (home village, zoomed in); revealing all `25×25` tiles of the home Territory unlocks a **`1`-tile ring (`3×3`)** around the village; subsequent Continent exploration reveals **`3×3` areas** around explored targets and zooms out dynamically.
