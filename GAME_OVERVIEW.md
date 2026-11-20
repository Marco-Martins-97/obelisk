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

1. **Stage 1 — World & Territory Generation (`/shared`)**
   - Deterministic `100×100` Continent generator (elevation, temperature, moisture, tectonic rock layers, rivers, biomes, single Obelisk placement).
   - Deterministic `25×25` Territory generator derived from `tileSeed`.
   - Vitest suite verifying seed determinism, bounds, and performance.
2. **Stage 2 — Map Viewport & Dev Visualizer (`/client`)**
   - Interactive HTML5 Canvas / Grid viewer for the `100×100` Continent and `25×25` Territory.
   - Layer toggles (Elevation, Temperature, Moisture, Rock/Ore, Biomes) + seed controls + click-to-zoom inspection.
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
- [architecture_spec.md](file:///mnt/storage/Projects/Dev/Web/Obelisk_dev/docs/architecture_spec.md)
- [world_spec.md](file:///mnt/storage/Projects/Dev/Web/Obelisk_dev/docs/world_spec.md)
- [building_spec.md](file:///mnt/storage/Projects/Dev/Web/Obelisk_dev/docs/building_spec.md)
- [resource_spec.md](file:///mnt/storage/Projects/Dev/Web/Obelisk_dev/docs/resource_spec.md)
