# Obelisk — Game Overview & Build Plan

**Obelisk** is an asynchronous, browser-based MMORTS built on the **MERN stack + Socket.io**. It blends the persistent world map, timed expeditions, and marketplace trading of *Tribal Wars* with the geological scarcity, seasonal survival, and progression depth of *TerraFirmaCraft (TFC)*—shifting the core focus from war and conquest to **survival, exploration, and trading**.

---

## 1. Core Pillars
- **Exploration & The Obelisk:** A single ancient ruined city of magic—**The Obelisk**—exists on the `100×100` continent. Players prepare and dispatch timed expeditions to explore both their local `25×25` regional territories and distant world tiles, culminating in expeditions to the Obelisk to uncover lost technologies and treasures.
- **TFC-Inspired Survival & Scarcity:** Resources are not uniform. Ores and minerals follow geological rock strata, food spoils over time, fuel is required for warmth and smelting, and seasons cycle continuously.
- **Tribal Wars-Style Trading:** Regional geological scarcity drives trade. Players use marketplaces and timed caravans to exchange surplus resources for what they lack.
- **Asynchronous MMORTS:** No twitch combat or 1-second server ticks. Actions resolve via discrete timestamps and lazy state evaluation.

---

## 2. Time & Season Scale (`6×` Real Time)
| Unit | In-Game Duration | Real-Time Equivalent |
| :--- | :--- | :--- |
| **1 Day** | 1 in-game day | **4 hours** |
| **1 Real Day** | 6 in-game days | **24 hours** |
| **1 Month** | 28 in-game days | **112 hours** (~4.67 real days) |
| **1 Season** | 3 in-game months (84 days) | **14 real days** (2 real weeks) |
| **1 Year** | 4 seasons (336 days) | **56 real days** (~8 real weeks) |

Seasons cycle through **Spring → Summer → Autumn → Winter**, affecting temperature, crop growth, spoilage rates, and expedition preparation requirements.

---

## 3. Settlements & Expansion
- **Capital (`7×7` grid):** A player may **upgrade** only **1** settlement to a `7×7` Capital.
- **Cities / Villages (`5×5` grid):** Players can hold multiple `5×5` settlements.
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

## 5. Staged Build Roadmap
We build strictly **one stage at a time**, verifying each stage with automated tests before moving on:

0. **Stage 0 — Monorepo & Tooling Bootstrap** *(Complete)*
   - npm workspaces (`shared`, `client`, `server`), pure ESM, Vitest, ESLint (`Math.random` ban in `/shared/generators/`), Vite + React + Tailwind CSS.
1. **Stage 1 — World & Territory Generation (`/shared`)** *(Complete)*
   - Deterministic `N×N` Continent generator (default `100×100`: elevation, temperature, moisture, single-layer rock types, biomes, single buildable Obelisk).
   - Deterministic `M×M` Territory generator (default `25×25`: neighbor-interpolated terrain, rivers/lakes, `>= 1` water tile, dry `7×7` settlement zone, strata-matched resource nodes).
   - Vitest suite verifying seed determinism, bounds, and performance (`15/15` passing).
2. **Stage 2 — Map Viewport & Dev Visualizer (`/client`)** *(Complete)*
   - Dual **Gameplay** (surface tile sprites) & **Dev** (heatmap layers, `10×` Territory contrast, `60%` red unbuildable overlay) HTML5 Canvas views with on-screen `+1` frustum culling and clamped pan/zoom.
   - Full `25×25` Territory primary view + `32px` Continent sidebar overview + live seed/size controls (`24/24` Vitest passing).
3. **Stage 3 — Buildings (`/shared` + UI preview)**
   - Universal `createBuilding` factory template in `/shared/config/`.
   - Storage (`sizeClass` 1–5), production, degradation/maintenance, and dual upgrade axis (`tier` + `level`) on `7×7` and `5×5` grids.
4. **Stage 4 — Resources (`/shared`)**
   - Universal `createResource` factory template in `/shared/config/`.
   - TFC-inspired resource categories, `sizeClass` bulk capacity, lazy food spoilage, fuel burn, and trade definitions.
5. **Stage 5 — Persistence, Auth & Lazy State (`/server`)**
   - Express API, MongoDB Atlas sparse schemas (no bulk terrain storage), JWT/session auth, and lazy delta calculators.
6. **Stage 6 — Real-Time, Expeditions & Trading (`/server` + `/client`)**
   - Socket.io live updates, BullMQ scheduled events (expeditions, Obelisk exploration, Tribal Wars-style marketplace & caravans), Fog of War enforcement.

---

## 6. Domain Specifications
- [architecture_spec.md](./docs/architecture_spec.md)
- [world_spec.md](./docs/world_spec.md)
- [building_spec.md](./docs/building_spec.md)
- [resource_spec.md](./docs/resource_spec.md)
