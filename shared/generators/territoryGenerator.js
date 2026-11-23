import { DEFAULT_TERRITORY_SIZE } from '../config/worldConstants.js';
import { ELEVATION_BANDS, ORES, ROCK_TYPES } from '../config/worldGeology.js';
import { createNoise2D, fbm2D } from './noise.js';
import { createPrng, hashCoords, randomInt } from './prng.js';

/** Minimum forestDensity required for a tile to count as a forest tile. */
export const TERRITORY_FOREST_THRESHOLD = 0.52;

/**
 * Clamps a numeric value to [0, 1].
 *
 * @param {number} value - Input value.
 * @returns {number} Clamped value.
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Extracts a Fog-of-War-safe neighbor context for a continent tile at (x, y).
 * Missing map-edge neighbors clamp to the center tile's scalar values.
 * Never exposes neighboring tileSeeds.
 *
 * @param {{ size: number, tiles: Array<object> }} continent - Generated continent.
 * @param {number} x - Continent X coordinate.
 * @param {number} y - Continent Y coordinate.
 * @returns {{
 *   center: object,
 *   north: object,
 *   south: object,
 *   east: object,
 *   west: object,
 * }} Neighbor scalar context.
 */
export function getWorldTileContext(continent, x, y) {
  const { size, tiles } = continent;
  if (x < 0 || x >= size || y < 0 || y >= size) {
    throw new RangeError(`Continent coordinates (${x}, ${y}) out of bounds for size ${size}.`);
  }

  const pick = (tx, ty) => {
    const cx = Math.max(0, Math.min(size - 1, tx));
    const cy = Math.max(0, Math.min(size - 1, ty));
    const t = tiles[cy * size + cx];
    return {
      elevation: t.elevation,
      temperature: t.temperature,
      moisture: t.moisture,
      rockType: t.rockType,
      biome: t.biome,
      buildable: t.buildable,
      isObelisk: t.isObelisk,
    };
  };

  return {
    center: pick(x, y),
    north: pick(x, y - 1),
    south: pick(x, y + 1),
    east: pick(x + 1, y),
    west: pick(x - 1, y),
  };
}

/**
 * Smoothly interpolates a scalar field across [0, 1] x [0, 1] using center and
 * cardinal neighbor values so adjacent continent tiles influence territory edges.
 *
 * @param {number} center - Center continent tile value.
 * @param {number} north - North neighbor value.
 * @param {number} south - South neighbor value.
 * @param {number} east - East neighbor value.
 * @param {number} west - West neighbor value.
 * @param {number} nx - Normalized local X in [0, 1].
 * @param {number} ny - Normalized local Y in [0, 1].
 * @returns {number} Interpolated base value.
 */
function interpolateFromNeighbors(center, north, south, east, west, nx, ny) {
  const northEdge = (center + north) * 0.5;
  const southEdge = (center + south) * 0.5;
  const westEdge = (center + west) * 0.5;
  const eastEdge = (center + east) * 0.5;

  const yBlend =
    ny <= 0.5
      ? northEdge + (center - northEdge) * (ny * 2)
      : center + (southEdge - center) * ((ny - 0.5) * 2);

  const xBlend =
    nx <= 0.5
      ? westEdge + (center - westEdge) * (nx * 2)
      : center + (eastEdge - center) * ((nx - 0.5) * 2);

  return (xBlend + yBlend) * 0.5;
}

/**
 * Carves a deterministic downhill stream from a starting tile.
 *
 * @param {Array<object>} tiles - Territory tile array.
 * @param {number} size - Territory grid size.
 * @param {number} startX - Starting X coordinate.
 * @param {number} startY - Starting Y coordinate.
 * @param {() => number} rng - Seeded PRNG.
 */
function carveDownhillRiver(tiles, size, startX, startY, rng) {
  let cx = startX;
  let cy = startY;
  const maxSteps = size * 2;
  const visited = new Set();

  for (let step = 0; step < maxSteps; step += 1) {
    const idx = cy * size + cx;
    if (visited.has(idx)) break;
    visited.add(idx);

    const current = tiles[idx];
    if (!current.inSettlementZone) {
      current.isWater = true;
      current.waterType = 'river';
      current.forestDensity = 0;
    }

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ].filter(
      ([nx, ny]) =>
        nx >= 0 && nx < size && ny >= 0 && ny < size && !visited.has(ny * size + nx),
    );

    if (neighbors.length === 0) break;

    let best = neighbors[0];
    let bestScore = tiles[best[1] * size + best[0]].elevation + rng() * 0.015;

    for (let i = 1; i < neighbors.length; i += 1) {
      const [nx, ny] = neighbors[i];
      const score = tiles[ny * size + nx].elevation + rng() * 0.015;
      if (score < bestScore) {
        best = [nx, ny];
        bestScore = score;
      }
    }

    const nextTile = tiles[best[1] * size + best[0]];
    if (nextTile.isWater && nextTile.waterType === 'lake') {
      break;
    }

    cx = best[0];
    cy = best[1];
  }
}

/**
 * Deterministically generates a 25x25 (configurable) Territory grid from a
 * tileSeed and its parent continent neighbor context.
 *
 * Generates one independent ore-vein density layer per ore hosted by the parent
 * tile's rockType, scaled by ore rarity (rarer ores form smaller hotspots).
 *
 * @param {string | number} tileSeed - Deterministic seed for this world tile.
 * @param {{ center: object, north: object, south: object, east: object, west: object }} worldTileContext - Neighbor scalar context.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.size=DEFAULT_TERRITORY_SIZE] - Territory width & height (MxM).
 * @returns {{
 *   tileSeed: string | number,
 *   size: number,
 *   rockType: string,
 *   availableOres: Array<string>,
 *   biome: string,
 *   waterCount: number,
 *   tiles: Array<{
 *     x: number,
 *     y: number,
 *     elevation: number,
 *     temperature: number,
 *     moisture: number,
 *     ores: Record<string, number>,
 *     forestDensity: number,
 *     isWater: boolean,
 *     waterType: 'lake' | 'river' | 'spring' | null,
 *     inSettlementZone: boolean,
 *     buildable: boolean,
 *   }>,
 * }} Generated territory grid.
 */
export function generateTerritory(
  tileSeed,
  worldTileContext,
  { size = DEFAULT_TERRITORY_SIZE } = {},
) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Territory size must be a positive integer, received: ${size}`);
  }

  const { center, north, south, east, west } = worldTileContext;
  const elevNoise = createNoise2D(hashCoords(tileSeed, 0, 0, 11));
  const moistNoise = createNoise2D(hashCoords(tileSeed, 0, 0, 12));
  const forestNoise = createNoise2D(hashCoords(tileSeed, 0, 0, 14));
  const rng = createPrng(hashCoords(tileSeed, 0, 0, 13));

  const rockInfo = ROCK_TYPES.find((r) => r.id === center.rockType) ?? ROCK_TYPES[0];
  const availableOres = rockInfo.ores;

  // Build independent hotspot veins + noise sampler for each ore in this rock type.
  const oreConfigs = availableOres.map((oreId, idx) => {
    const oreMeta = ORES[oreId] ?? ORES.copper;
    const oreRng = createPrng(hashCoords(tileSeed, idx, 0, 200));
    const veinCount = oreMeta.rarity === 'very_rare' || oreMeta.rarity === 'rare' ? 1 : randomInt(oreRng, 1, 2);
    const radius = Math.max(1.2, size * oreMeta.veinRadiusScale);

    const veins = Array.from({ length: veinCount }, () => ({
      vx: randomInt(oreRng, 0, size - 1),
      vy: randomInt(oreRng, 0, size - 1),
      radius,
      strength: 0.72 + oreRng() * 0.28,
    }));

    return {
      oreId,
      veins,
      noise: createNoise2D(hashCoords(tileSeed, idx, 0, 300)),
    };
  });

  const biomeForestBias =
    center.biome === 'tropical_forest'
      ? 0.72
      : center.biome === 'temperate_forest'
        ? 0.62
        : center.biome === 'taiga'
          ? 0.55
          : center.biome === 'savanna' || center.biome === 'grassland'
            ? 0.28
            : 0.05;

  const maxCoord = Math.max(1, size - 1);
  const centerCoord = Math.floor(size / 2);
  const halfFootprint = size >= 9 ? 3 : 0;

  const tiles = new Array(size * size);
  let lowestDryIdx = -1;
  let lowestDryElevation = Infinity;

  for (let y = 0; y < size; y += 1) {
    const ny = y / maxCoord;
    for (let x = 0; x < size; x += 1) {
      const nx = x / maxCoord;

      const baseElev = interpolateFromNeighbors(
        center.elevation,
        north.elevation,
        south.elevation,
        east.elevation,
        west.elevation,
        nx,
        ny,
      );
      const baseTemp = interpolateFromNeighbors(
        center.temperature,
        north.temperature,
        south.temperature,
        east.temperature,
        west.temperature,
        nx,
        ny,
      );
      const baseMoist = interpolateFromNeighbors(
        center.moisture,
        north.moisture,
        south.moisture,
        east.moisture,
        west.moisture,
        nx,
        ny,
      );

      const elevJitter = (fbm2D(elevNoise, x, y, { scale: 0.16, octaves: 3 }) - 0.5) * 0.14;
      const moistJitter = (fbm2D(moistNoise, x, y, { scale: 0.14, octaves: 2 }) - 0.5) * 0.14;

      const rawElevation = clamp01(baseElev + elevJitter);
      const moisture = clamp01(baseMoist + moistJitter);

      const inSettlementZone =
        halfFootprint > 0 &&
        Math.abs(x - centerCoord) <= halfFootprint &&
        Math.abs(y - centerCoord) <= halfFootprint;

      const lakeThreshold = ELEVATION_BANDS.SEA_LEVEL - 0.04 + moisture * 0.06;
      const isLake = !inSettlementZone && rawElevation < lakeThreshold;

      // On buildable land Continent tiles adjacent to oceans, dry land sub-tiles cannot
      // dip below SEA_LEVEL and turn into unbuildable sub-tiles.
      const elevation =
        !isLake && center.elevation >= ELEVATION_BANDS.SEA_LEVEL
          ? Math.max(ELEVATION_BANDS.SEA_LEVEL, rawElevation)
          : rawElevation;

      const temperature = clamp01(
        baseTemp - Math.max(0, elevation - ELEVATION_BANDS.SEA_LEVEL) * 0.15,
      );

      // Compute independent ore density [0, 1] for each ore allowed by rockType.
      const ores = {};
      for (const cfg of oreConfigs) {
        let peakSignal = 0;
        for (const v of cfg.veins) {
          const distSq = (x - v.vx) ** 2 + (y - v.vy) ** 2;
          const falloff = Math.exp(-distSq / (2 * v.radius * v.radius));
          peakSignal = Math.max(peakSignal, falloff * v.strength);
        }
        const oreJitter = fbm2D(cfg.noise, x, y, { scale: 0.22, octaves: 2 }) * 0.18;
        ores[cfg.oreId] = clamp01(peakSignal * 0.85 + oreJitter);
      }

      const rawForest =
        isLake || inSettlementZone || elevation >= ELEVATION_BANDS.MOUNTAIN_LEVEL
          ? 0
          : clamp01(
              biomeForestBias * 0.65 +
                fbm2D(forestNoise, x, y, { scale: 0.18, octaves: 3 }) * 0.55 -
                0.2,
            );

      const buildable =
        !isLake &&
        elevation >= ELEVATION_BANDS.SEA_LEVEL &&
        elevation < ELEVATION_BANDS.MOUNTAIN_LEVEL;

      const idx = y * size + x;
      tiles[idx] = {
        x,
        y,
        elevation,
        temperature,
        moisture,
        ores,
        forestDensity: rawForest,
        isWater: isLake,
        waterType: isLake ? 'lake' : null,
        inSettlementZone,
        buildable,
      };

      if (!inSettlementZone && !isLake && elevation < lowestDryElevation) {
        lowestDryElevation = elevation;
        lowestDryIdx = idx;
      }
    }
  }

  if (size >= 5 && center.moisture >= 0.35) {
    const startSide = randomInt(rng, 0, 3);
    const edgeCoord = randomInt(rng, 0, size - 1);
    const startX = startSide === 0 ? 0 : startSide === 1 ? size - 1 : edgeCoord;
    const startY = startSide === 2 ? 0 : startSide === 3 ? size - 1 : edgeCoord;
    carveDownhillRiver(tiles, size, startX, startY, rng);
  }

  let waterCount = tiles.reduce((acc, t) => acc + (t.isWater ? 1 : 0), 0);
  if (waterCount === 0) {
    const fallbackIdx = lowestDryIdx !== -1 ? lowestDryIdx : 0;
    tiles[fallbackIdx].isWater = true;
    tiles[fallbackIdx].waterType = 'spring';
    tiles[fallbackIdx].forestDensity = 0;
    tiles[fallbackIdx].buildable = false;
    waterCount = 1;
  }

  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i].isWater) {
      tiles[i].buildable = false;
    }
  }

  // Compute Territory moisture from distance to water tiles (multi-source BFS).
  const dist = new Int32Array(size * size).fill(-1);
  const queue = [];
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i].isWater) {
      dist[i] = 0;
      queue.push(i);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head];
    head += 1;
    const cx = idx % size;
    const cy = (idx - cx) / size;
    const nextDist = dist[idx] + 1;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const nIdx = ny * size + nx;
      if (dist[nIdx] === -1) {
        dist[nIdx] = nextDist;
        queue.push(nIdx);
      }
    }
  }

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    const d = dist[i] === -1 ? size : dist[i];
    const waterProximity = Math.exp(-d / 4.5);
    const localJitter = fbm2D(moistNoise, t.x, t.y, { scale: 0.2, octaves: 2 }) * 0.12;
    t.moisture = t.isWater ? 1 : clamp01(waterProximity * 0.88 + localJitter);
  }

  // Guarantee at least 1 forest tile per territory outside water and the settlement zone.
  let hasForest = false;
  let bestForestCandidateIdx = -1;
  let bestForestScore = -1;

  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (t.isWater || t.inSettlementZone) continue;
    if (t.forestDensity >= TERRITORY_FOREST_THRESHOLD) {
      hasForest = true;
      break;
    }
    if (t.forestDensity >= bestForestScore) {
      bestForestScore = t.forestDensity;
      bestForestCandidateIdx = i;
    }
  }

  if (!hasForest && bestForestCandidateIdx !== -1) {
    tiles[bestForestCandidateIdx].forestDensity = 0.65;
  }

  return {
    tileSeed,
    size,
    rockType: rockInfo.id,
    availableOres,
    biome: center.biome,
    waterCount,
    tiles,
  };
}
