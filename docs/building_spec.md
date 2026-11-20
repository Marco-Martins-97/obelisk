# Building System Specification (Stage 3)

## 1. Settlement Grid Sizes
- **Capital:** `7 × 7` buildable grid (`49` slots). A player may upgrade only **1** settlement to a Capital.
- **Cities / Villages:** `5 × 5` buildable grid (`25` slots). Players may own multiple cities.
- **Open Edge Case (Deferred to Conquest Stage):** Handling of conquering another player's `7×7` Capital (keeping vs. auto-downgrading to `5×5` to prevent alt-account Capital farming).

---

## 2. Data-Driven Factory (`createBuilding`)
All buildings are defined in `/shared/config/buildings.js` via a strict factory template with normalized defaults. MongoDB stores only dynamic building instances per settlement:
```js
// Conceptual instance stored in DB (Stage 5+)
{
  buildingId: 'granary',
  gridX: 2,
  gridY: 3,
  tier: 1,
  level: 2,
  condition: 100,       // 0–100% durability
  lastUpdated: Date
}
```

---

## 3. Core Stage 3 Mechanics
1. **Storage & `sizeClass` Capacity:**
   - Buildings provide bulk storage capacity measured against resource `sizeClass` (1–5) and volume limits.
   - Specialized storage (e.g., Granary/Cellar) reduces food spoilage rates.
2. **Production:**
   - Pure rate formulas evaluated lazily (`rate * elapsedTime * efficiency`), gated by worker/fuel/tool availability.
3. **Degradation & Maintenance:**
   - Buildings degrade slowly over in-game time (accelerated by harsh winter weather or heavy use) based on `lastUpdated` lazy math.
   - Below a condition threshold, production efficiency drops; repair costs base materials.
   - *Design Guardrail:* Degradation reduces efficiency or pauses production—it does **not** permanently destroy a player's core buildings offline.
4. **Dual Upgrade Axis (`tier` & `level`):**
   - **Level (1..N):** Incremental capacity, efficiency, and durability improvements within the current era.
   - **Tier (1..M):** Technological/material breakthroughs (e.g., Wood/Stone → Copper/Bronze → Iron → Obelisk-unlocked tech) requiring rarer materials and unlocking new recipes/workers.
