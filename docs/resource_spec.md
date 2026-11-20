# Resource & Economy Specification (Stage 4)

## 1. Data-Driven Factory (`createResource`)
All resources are defined in `/shared/config/resources.js` via a universal factory template. Player/settlement inventories store only `{ resourceId -> quantity / metadata }` maps so new resources never require schema migrations.

---

## 2. Resource Properties
- **`id` & `category`:** `stone`, `ore`, `metal`, `wood`, `fuel`, `food`, `tool`, `treasure`.
- **`sizeClass` (1–5):** Bulkiness/weight tier governing warehouse storage consumption and caravan/expedition carry capacity:
  - `1` (Tiny): Seeds, gems, coins, ancient relics.
  - `2` (Small): Ingots, dried rations, herbs.
  - `3` (Medium): Logs, raw ore chunks, basic tools.
  - `4` (Large): Cut stone blocks, timber beams, barrels.
  - `5` (Massive): Heavy machinery parts, monolith blocks.
- **`spoilRate` (Perishables):** Food decays lazily over in-game time (`6×` real time), modified by season (slower in Winter, faster in Summer) and storage building modifiers (e.g., Cellar/Granary).
- **`burnValue` (Fuel):** Wood, charcoal, and coal values used for smelting ores and surviving Winter warmth demands.
- **`geologyTags` (TFC Scarcity):** Links ores/stones to specific continent rock strata (e.g., Tin/Copper/Iron/Flux) so players cannot mine everything locally.

---

## 3. Trading & Expedition Preparation (Stage 6 Integration)
- **Tribal Wars-Style Marketplace:** Players post offers exchanging surplus resources for needed ones, fulfilled by timed caravans constrained by `sizeClass` capacity.
- **Expedition Preparation:** Exploring `25×25` territory zones, distant world tiles, or **The Obelisk** consumes food rations, tools, and fuel proportional to distance, season, and hazard level.
