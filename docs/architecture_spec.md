# Architecture & Deployment Specification

## 1. Monorepo Layout
```text
Obelisk_dev/
├── client/          # React + Vite + Tailwind CSS (deploys to Vercel)
├── server/          # Node.js + Express + Socket.io + BullMQ (deploys to Render)
├── shared/          # Isomorphic ES6+ configs, deterministic generators, pure math
│   ├── config/      # createResource, createBuilding, world constants
│   ├── generators/  # continentGenerator.js, territoryGenerator.js, prng.js
│   └── utils/       # lazy math, validation, coordinate helpers
├── docs/            # Tracked domain specifications
├── dev_resources/   # Local-only scratch (gitignored; never store project code/docs)
└── GAME_OVERVIEW.md # Master vision & roadmap
```

### Isomorphic `/shared` Purity Rule
Code inside `/shared` **must not** import Node built-ins (`fs`, `crypto`, `path`) or browser APIs (`window`, `document`). Both Vite (`/client`) and Node (`/server`) must import it identically.

---

## 2. Four Core Architecture Laws
1. **Strict Seeded Determinism (No `Math.random()`):**
   - `Math.random()` is banned inside `/shared/generators/`.
   - All procedural generation uses pure seeded PRNGs (e.g., `mulberry32` / `sfc32`) and seeded 2D noise so `/client` and `/server` regenerate identical `25×25` territories from a given `tileSeed`.
2. **Zero Terrain Bloat:**
   - Never bulk-store static terrain tiles in MongoDB.
   - `/server` generates the `100×100` Continent (`10,000` tiles) in memory on boot from a secret `masterWorldSeed`.
   - MongoDB stores only **sparse dynamic deltas**: claimed territories, player settlements, placed buildings, harvested nodes, and explored coordinates.
   - Each tile's `tileSeed = hash(masterWorldSeed, x, y)` is revealed to `/client` **only after** a player scouts or claims that tile (enforcing Fog of War).
3. **Data-Driven Universal Templates:**
   - All resources (`createResource`) and buildings (`createBuilding`) live in `/shared/config/` with normalized defaults.
   - MongoDB stores dynamic instances (`inventory` Maps, coordinates, `tier`, `level`, `lastUpdated`) so adding new content never requires database migrations.
4. **Lazy State Calculation & Authoritative Server:**
   - Never run 1-second server cron loops for production, fuel burn, or food decay.
   - Compute exact deltas lazily from `lastUpdated` timestamps on read or before state-mutating actions.
   - Use BullMQ + Redis strictly for discrete scheduled events (building completion, expedition arrival, caravan delivery).

---

## 3. Deployment & Free-Tier Trade-Offs

### Frontend: Separate Vercel Instance + Personal Domain
- **Recommended:** Attach `/client` as a **subdomain** (e.g., `obelisk.yourdomain.com`) via a `CNAME` record pointing to Vercel.
- **Why not subpath (`yourdomain.com/obelisk`)?** Subpath proxying via Vercel Rewrites complicates Vite asset `base` paths, cookie scoping, and CORS/WebSocket handshakes.

### Backend: Render (Free Tier) + MongoDB Atlas (M0)
- **Why Render + Atlas:** Zero-cost persistent Node.js process (unlike Vercel serverless functions, which cannot hold Socket.io connections or BullMQ workers) paired with 512MB managed MongoDB.
- **Free-Tier Limitations & Mitigations:**
  - *Render Sleep:* Free web services spin down after 15 minutes of inactivity, dropping active WebSockets and pausing in-process timers until the next HTTP wake-up (~30–50s cold start).
  - *Mitigation:* Because state uses **Lazy Evaluation** (`lastUpdated` timestamps) and discrete jobs live in external **Redis/BullMQ** (e.g., Upstash), sleeping does not corrupt resource math or lose scheduled events—missed jobs process immediately on wake-up.
  - *Atlas M0:* 512MB storage and 500 max connections. Sparse delta storage keeps DB footprint minimal.
