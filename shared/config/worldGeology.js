/**
 * Geological rock types, elevation bands, and biome classification rules
 * shared across continent/territory generators and the Stage 2 visualizer.
 */

/** Elevation thresholds normalized to [0, 1]. */
export const ELEVATION_BANDS = {
  SEA_LEVEL: 0.38,
  MOUNTAIN_LEVEL: 0.78,
};

/**
 * Specific TFC-inspired single-layer rock types and the ores they can host.
 * Ordered so low-frequency noise maps cleanly into regional provinces.
 */
export const ROCK_TYPES = [
  {
    id: 'limestone',
    name: 'Limestone',
    ores: ['flux', 'copper'],
    color: '#d6d3c9',
  },
  {
    id: 'shale',
    name: 'Shale',
    ores: ['coal', 'iron'],
    color: '#6b7280',
  },
  {
    id: 'granite',
    name: 'Granite',
    ores: ['tin', 'silver', 'gold'],
    color: '#c08484',
  },
  {
    id: 'gabbro',
    name: 'Gabbro',
    ores: ['copper', 'nickel'],
    color: '#4b5563',
  },
  {
    id: 'basalt',
    name: 'Basalt',
    ores: ['copper', 'iron'],
    color: '#374151',
  },
  {
    id: 'slate',
    name: 'Slate',
    ores: ['gold', 'silver'],
    color: '#64748b',
  },
  {
    id: 'marble',
    name: 'Marble',
    ores: ['flux', 'gems'],
    color: '#f1f5f9',
  },
];

/** Biome metadata (display name + hex color for Canvas rendering). */
export const BIOMES = {
  ocean: { id: 'ocean', name: 'Ocean', color: '#1d4ed8' },
  mountain: { id: 'mountain', name: 'Mountain', color: '#78716c' },
  tundra: { id: 'tundra', name: 'Tundra', color: '#cbd5e1' },
  taiga: { id: 'taiga', name: 'Taiga', color: '#115e59' },
  temperate_forest: { id: 'temperate_forest', name: 'Temperate Forest', color: '#15803d' },
  grassland: { id: 'grassland', name: 'Grassland', color: '#65a30d' },
  desert: { id: 'desert', name: 'Desert', color: '#eab308' },
  savanna: { id: 'savanna', name: 'Savanna', color: '#ca8a04' },
  tropical_forest: { id: 'tropical_forest', name: 'Tropical Forest', color: '#166534' },
};

/**
 * Classifies a tile's biome from elevation, temperature, and moisture in [0, 1].
 *
 * @param {number} elevation - Normalized elevation [0, 1].
 * @param {number} temperature - Normalized temperature [0, 1].
 * @param {number} moisture - Normalized moisture [0, 1].
 * @returns {string} Biome ID matching a key in BIOMES.
 */
export function classifyBiome(elevation, temperature, moisture) {
  if (elevation < ELEVATION_BANDS.SEA_LEVEL) {
    return 'ocean';
  }
  if (elevation >= ELEVATION_BANDS.MOUNTAIN_LEVEL) {
    return 'mountain';
  }

  // Cold climates (north / high altitude)
  if (temperature < 0.3) {
    return moisture < 0.4 ? 'tundra' : 'taiga';
  }

  // Hot climates (south / low altitude)
  if (temperature > 0.65) {
    if (moisture < 0.32) return 'desert';
    if (moisture < 0.6) return 'savanna';
    return 'tropical_forest';
  }

  // Temperate band
  if (moisture < 0.32) return 'desert';
  if (moisture < 0.56) return 'grassland';
  return 'temperate_forest';
}
