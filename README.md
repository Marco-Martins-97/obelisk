# Obelisk (`v0.1.0`)

An asynchronous, browser-based MMORTS built on the MERN stack + Socket.io, blending *Tribal Wars*-style persistent world exploration and trading with *TerraFirmaCraft*-inspired geological scarcity and seasonal survival.

---

## Current Version: `v0.1.0` (Stages 0–2 Complete)

- **Stage 0 — Monorepo & Tooling:** npm workspaces (`shared`, `client`, `server`), pure ES6+ ESM, Vitest, ESLint (banning `Math.random()` in `/shared/generators/`), React 19, Vite 8, Tailwind CSS v4.
- **Stage 1 — World & Territory Generators (`/shared`):**
  - Deterministic `N×N` Continent generator (default `100×100`) with latitude/elevation temperature, domain-warped Voronoi stone provinces (7 rock types), biomes, and **1** guaranteed buildable Obelisk.
  - Deterministic `M×M` Territory generator (default `25×25`) with neighbor-interpolated elevation/temperature, rivers/lakes (`>= 1` water tile), water-distance moisture, `>= 1` forest tile, dry `7×7` settlement zone, and rarity-scaled per-ore prospecting layers.
- **Stage 2 — Map Viewport & Dev Visualizer (`/client`):**
  - **Gameplay View:** Cached `16×16` offscreen surface sprites for terrain, water, forest canopies, and the Obelisk.
  - **Dev View:** Layer heatmaps (`Biome`, grayscale `Elevation`, `Temperature`, `Moisture`, `Stone`, `Forest`, and per-ore `Ores`), `10×` Territory contrast, **Unbuildable (60% Red)** overlay, and `tileSeed` inspection.
  - Viewport frustum culling (`on-screen + 1` tile) and clamped pan/zoom.

---

## Workspace Structure

```text
Obelisk/
├── client/   # React + Vite + Tailwind CSS frontend (@obelisk/client)
├── shared/   # Isomorphic ES6+ config, deterministic generators, tests (@obelisk/shared)
├── server/   # Node.js backend workspace placeholder (@obelisk/server, Stage 5+)
└── docs/     # Domain specifications (world, building, resource, architecture)
```

---

## Local Development

```bash
# Install all workspace dependencies from the repo root
npm install

# Run all unit & UI tests (Vitest)
npm test

# Run ESLint across all workspaces
npm run lint

# Start the Stage 2 Map Visualizer dev server
npm run dev:client

# Build the production frontend bundle
npm run build:client
```

---

## Deploying `/client` to Vercel (Free Tier)

Because `@obelisk/client` imports `@obelisk/shared` via npm workspaces, configure Vercel at the **repository root**:

1. **Root Directory:** `.` (repo root)
2. **Install Command:** `npm install`
3. **Build Command:** `npm run build:client`
4. **Output Directory:** `client/dist`
