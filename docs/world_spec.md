# World & Territory Specification (Stages 1 & 2)

## 1. World Hierarchy & The `25×` Scale Law
- **Continent (World Map):** Configurable `N × N` grid (default `100 × 100` = `10,000` world tiles, coordinates `(0,0)` to `(99,99)`).
- **Territory (Regional Zone):** Each world tile expands into a configurable `M × M` regional grid (default `25 × 25` = `625` sub-tiles, coordinates `(0,0)` to `(24,24)`).
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
- **The Obelisk:** Exactly **1** unique tile placed deterministically on a buildable land tile (never ocean or mountain), marked as `isObelisk: true`.

### Territory Generator (`territoryGenerator.js`)
Generates an `M×M` regional grid from `(tileSeed, worldTileContext)`:
- **Neighbor Interpolation:** Smoothly interpolates `elevation` and `temperature` from the center tile and its cardinal continent neighbors (`north`, `south`, `east`, `west`), plus local micro-noise.
- **Water (Lakes, Rivers & Minimum Guarantee):** Carves local lakes and downhill streams, guaranteeing **at least 1 water tile** (`spring` fallback) per territory.
- **Water-Driven Moisture:** Computed via multi-source BFS distance from Territory water tiles (`isWater`).
- **Forest Layer:** Territory-only `forestDensity` (`0.0`–`1.0`) guaranteeing **at least 1 forest tile** (`>= 0.52`) outside water and the settlement zone.
- **Per-Ore Prospecting Layers:** No pre-spawned ore nodes; instead, each ore hosted by the parent tile's `rockType` gets an independent `ores[oreId]` (`0.0`–`1.0`) density field scaled by ore rarity (`common` → broader veins, `very_rare` → tiny concentrated pockets).
- **Settlement Zone:** Reserves a dry, forest-free central `7×7` buildable zone for a settlement (`7×7` Capital or `5×5` City).

### Stage 1 Verification Gate (Vitest)
- Identical seed produces byte-for-byte identical `100×100` and `25×25` outputs.
- Boundary coordinates `(0,0)` and `(99,99)` / `(24,24)` execute without out-of-bounds errors.
- Exactly 1 Obelisk tile exists on a buildable continent tile; all 7 stone types generate; every territory has `>= 1` water tile, `>= 1` forest tile, and a clear `7×7` settlement zone.
- Fast generation benchmark (`<50ms` for full continent, `<5ms` per territory).

---

## 3. Stage 2 — Map Viewport & Dev Visualizer (`/client`)
Before adding backend persistence, `/client` hosts an interactive **Map Sandbox** with viewport frustum culling (renders only on-screen tiles `+ 1` padding) and clamped pan/zoom:
- **Territory Terrain (Primary Map):** Full `25×25` view by default (`672×672` centered canvas), zoomable/pannable with hover inspection.
- **Continent Overview (Sidebar Map):** `320×320` centered canvas (`32px` local tiles, **Fit All** / **Center** controls) showing Stone (`rockType`) without ores.
- **Gameplay View:** Cached `16×16` offscreen surface sprites for biomes, lakes/rivers/springs, forest canopies, and the Obelisk.
- **Dev View:** Data layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and per-ore `Ores` layers) with `10×` local contrast on Territory elevation/temperature, an **Unbuildable (60% Red)** overlay toggle, and `tileSeed` in hex.
- **Seed & Size Controls:** Live `masterWorldSeed` input + randomize + configurable Continent/Territory sizes.
