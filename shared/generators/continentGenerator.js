import { DEFAULT_CONTINENT_SIZE } from '../config/worldConstants.js';
import { ELEVATION_BANDS, ROCK_TYPES, classifyBiome } from '../config/worldGeology.js';
import { createNoise2D, fbm2D } from './noise.js';
import { createPrng, hashCoords, randomInt } from './prng.js';

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
 * Deterministically generates the Continent grid from a masterWorldSeed.
 *
 * Note: Continent tiles have no rivers (rivers & lakes live at the Territory
 * level). Each tile stores a single rockType and a deterministic tileSeed.
 *
 * @param {string | number} masterWorldSeed - Secret server world seed (or sandbox seed).
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.size=DEFAULT_CONTINENT_SIZE] - Grid width & height (NxN).
 * @returns {{
 *   seed: string | number,
 *   size: number,
 *   tiles: Array<{
 *     x: number,
 *     y: number,
 *     elevation: number,
 *     temperature: number,
 *     moisture: number,
 *     rockType: string,
 *     biome: string,
 *     buildable: boolean,
 *     isObelisk: boolean,
 *     tileSeed: number,
 *   }>,
 *   obeliskCoords: { x: number, y: number },
 * }} Generated continent state.
 */
export function generateContinent(masterWorldSeed, { size = DEFAULT_CONTINENT_SIZE } = {}) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Continent size must be a positive integer, received: ${size}`);
  }

  // Independent noise samplers per physical layer so fields don't mirror each other.
  const elevationNoise = createNoise2D(hashCoords(masterWorldSeed, 0, 0, 1));
  const tempNoise = createNoise2D(hashCoords(masterWorldSeed, 0, 0, 2));
  const moistureNoise = createNoise2D(hashCoords(masterWorldSeed, 0, 0, 3));
  const rockNoise = createNoise2D(hashCoords(masterWorldSeed, 0, 0, 4));

  const tiles = new Array(size * size);
  const buildableIndices = [];
  const maxCoord = Math.max(1, size - 1);

  for (let y = 0; y < size; y += 1) {
    // North (y=0) is colder than South (y=size-1).
    const latitude = y / maxCoord;
    const baseTemp = 0.15 + latitude * 0.75;

    for (let x = 0; x < size; x += 1) {
      const elevation = fbm2D(elevationNoise, x, y, { scale: 0.045, octaves: 4 });
      const tempJitter = (fbm2D(tempNoise, x, y, { scale: 0.03, octaves: 3 }) - 0.5) * 0.25;
      const elevationCooling = Math.max(0, elevation - ELEVATION_BANDS.SEA_LEVEL) * 0.45;
      const temperature = clamp01(baseTemp + tempJitter - elevationCooling);

      const moisture = fbm2D(moistureNoise, x, y, { scale: 0.04, octaves: 4 });

      // Low-frequency noise creates large regional rock provinces.
      const rockSample = fbm2D(rockNoise, x, y, { scale: 0.025, octaves: 2 });
      const rockIndex = Math.min(
        ROCK_TYPES.length - 1,
        Math.floor(rockSample * ROCK_TYPES.length),
      );
      const rockType = ROCK_TYPES[rockIndex].id;

      const biome = classifyBiome(elevation, temperature, moisture);
      const buildable =
        elevation >= ELEVATION_BANDS.SEA_LEVEL && elevation < ELEVATION_BANDS.MOUNTAIN_LEVEL;

      const idx = y * size + x;
      tiles[idx] = {
        x,
        y,
        elevation,
        temperature,
        moisture,
        rockType,
        biome,
        buildable,
        isObelisk: false,
        tileSeed: hashCoords(masterWorldSeed, x, y, 99),
      };

      if (buildable) {
        buildableIndices.push(idx);
      }
    }
  }

  // Place exactly 1 Obelisk on a buildable land tile (never ocean or mountain peak).
  const obeliskRng = createPrng(hashCoords(masterWorldSeed, 0, 0, 777));
  let obeliskIdx;

  if (buildableIndices.length > 0) {
    obeliskIdx = buildableIndices[randomInt(obeliskRng, 0, buildableIndices.length - 1)];
  } else {
    // Fallback for tiny custom test grids that happen to roll 100% ocean/mountain.
    obeliskIdx = 0;
    const fallbackTile = tiles[0];
    fallbackTile.elevation = (ELEVATION_BANDS.SEA_LEVEL + ELEVATION_BANDS.MOUNTAIN_LEVEL) * 0.5;
    fallbackTile.biome = classifyBiome(
      fallbackTile.elevation,
      fallbackTile.temperature,
      fallbackTile.moisture,
    );
    fallbackTile.buildable = true;
  }

  tiles[obeliskIdx].isObelisk = true;
  const obeliskCoords = { x: tiles[obeliskIdx].x, y: tiles[obeliskIdx].y };

  return {
    seed: masterWorldSeed,
    size,
    tiles,
    obeliskCoords,
  };
}
