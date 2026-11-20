# World & Territory Specification (Stages 1 & 2)

## 1. World Hierarchy & The `25×` Scale Law
- **Continent (World Map):** `100 × 100` grid (`10,000` world tiles, coordinates `(0,0)` to `(99,99)`).
- **Territory (Regional Zone):** Each world tile expands into a `25 × 25` regional grid (`625` sub-tiles, coordinates `(0,0)` to `(24,24)`).
- **Seed Derivation:**
  - Server holds `masterWorldSeed` (secret).
  - Each world tile derives `tileSeed = hash(masterWorldSeed, x, y)`.
  - Only scouted/claimed `tileSeed` values are sent to `/client`.

---

## 2. Stage 1 — Deterministic Generators (`/shared/generators/`)

### Continent Generator (`continentGenerator.js`)
Generates the `100×100` world map from `masterWorldSeed` using multi-octave seeded 2D noise (Simplex/Perlin or value noise):
- **Elevation:** Ocean/water bodies, lowlands, hills, mountain ranges.
- **Temperature:** Latitude gradient + elevation cooling + seasonal offset support.
- **Moisture:** Distance-to-water / noise-driven humidity + rain-shadow effects.
- **Tectonic Rock Strata (TFC-inspired):** Large regional rock provinces (e.g., *Sedimentary*, *Igneous Intrusive*, *Igneous Extrusive*, *Metamorphic*) that govern which ores and flux stones can spawn in a region.
- **Rivers:** Deterministic downhill flow paths from high elevation to sea level.
- **Biomes:** Derived from `(elevation, temperature, moisture)` lookup matrix.
- **The Obelisk:** Exactly **1** unique tile placed deterministically on the continent (e.g., central or high-significance ruin tile), marked as `isObelisk: true`.

### Territory Generator (`territoryGenerator.js`)
Generates a `25×25` regional grid from `(tileSeed, worldTileContext)`:
- Inherits parent world tile's biome, base elevation, temperature, moisture, and rock strata.
- Generates local micro-terrain (clearings, forests, cliffs, river crossings, soil fertility).
- Places local **resource nodes** (surface rocks, ore veins matching the tile's rock strata, wild crops, abandoned ruins) for expeditions to discover and harvest.
- Reserves a central buildable zone for a settlement (`7×7` Capital or `5×5` City) when claimed.

### Stage 1 Verification Gate (Vitest)
- Identical seed produces byte-for-byte identical `100×100` and `25×25` outputs.
- Boundary coordinates `(0,0)` and `(99,99)` / `(24,24)` execute without out-of-bounds errors.
- Exactly 1 Obelisk tile exists on the `100×100` continent.
- Valid distribution of biomes and rock strata; fast generation benchmark (<50ms for full continent, <5ms per territory).

---

## 3. Stage 2 — Map Viewport & Dev Visualizer (`/client`)
Before adding backend persistence, `/client` will host an interactive **Map Sandbox**:
- **Continent View (`100×100`):** HTML5 Canvas renderer with pan/zoom and coordinate tooltip.
- **Layer Toggles:** Biome, Elevation, Temperature, Moisture, Rock Strata / Ore Potential, Rivers, Obelisk Marker.
- **Seed Controls:** Input box + randomize button to test different `masterWorldSeed` values live.
- **Click-to-Inspect (`25×25`):** Clicking any world tile opens its deterministically generated `25×25` Territory grid with local node inspection.
