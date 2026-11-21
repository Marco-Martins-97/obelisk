import { BIOMES, ORES, ROCK_TYPES } from '@obelisk/shared';

/**
 * Pure color-mapping and metric-formatting helpers for Dev View data layers.
 */

const ROCK_COLOR_MAP = Object.fromEntries(ROCK_TYPES.map((r) => [r.id, r.color]));

/**
 * Converts a 6-digit hex color to an [r, g, b] tuple.
 *
 * @param {string} hex - Hex string like '#facc15'.
 * @returns {[number, number, number]} RGB tuple.
 */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Linearly interpolates between two RGB colors.
 *
 * @param {[number, number, number]} c1 - Start RGB.
 * @param {[number, number, number]} c2 - End RGB.
 * @param {number} t - Weight in [0, 1].
 * @returns {string} CSS rgb() string.
 */
function lerpRgb(c1, c2, t) {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * k);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * k);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Returns a Dev-view heatmap/category fill color for a continent or territory tile.
 * Supports optional contrast amplification (e.g. 10x) around a baseline so subtle
 * local territory gradients (0.41 vs 0.49) are clearly visible.
 *
 * @param {object} tile - Continent or territory tile object.
 * @param {string} layer - Active Dev layer (e.g., 'biome', 'rock', 'ore:iron', 'buildable').
 * @param {{ scale?: number, baseline?: { elevation?: number, temperature?: number, moisture?: number } }} [contrast]
 * @returns {string} CSS color string.
 */
export function getDevTileColor(tile, layer, contrast = {}) {
  const { scale = 1, baseline = null } = contrast;
  const amplify = (val, key) => {
    if (scale <= 1 || !baseline || typeof baseline[key] !== 'number') return val;
    return Math.max(0, Math.min(1, 0.5 + (val - baseline[key]) * scale));
  };

  if (layer === 'forest') {
    if (tile.isWater) return '#1d4ed8';
    const density = tile.forestDensity ?? 0;
    return lerpRgb([226, 232, 240], [20, 83, 45], density);
  }

  if (layer.startsWith('ore:')) {
    const oreId = layer.slice(4);
    const val = tile.ores?.[oreId] ?? 0;
    const oreColor = hexToRgb(ORES[oreId]?.color ?? '#f59e0b');
    return lerpRgb([15, 23, 42], oreColor, val);
  }

  if (layer === 'elevation') {
    // Grayscale: higher elevation = darker, lower elevation = lighter.
    const e = scale > 1 && baseline ? amplify(tile.elevation, 'elevation') : tile.elevation;
    return lerpRgb([241, 245, 249], [15, 23, 42], e);
  }

  if (layer === 'temperature') {
    const t = amplify(tile.temperature, 'temperature');
    if (t < 0.5) {
      return lerpRgb([59, 130, 246], [250, 204, 21], t * 2);
    }
    return lerpRgb([250, 204, 21], [220, 38, 38], (t - 0.5) * 2);
  }

  if (layer === 'moisture') {
    const m = amplify(tile.moisture, 'moisture');
    return lerpRgb([217, 179, 130], [14, 116, 144], m);
  }

  if (layer === 'rock') {
    return ROCK_COLOR_MAP[tile.rockType] ?? '#64748b';
  }

  if (tile.isWater) {
    return tile.waterType === 'lake' ? '#1d4ed8' : '#38bdf8';
  }
  return BIOMES[tile.biome]?.color ?? '#475569';
}

/**
 * Formats a compact numeric value for zoomed-in Dev View tile overlays.
 *
 * @param {object} tile - Tile data.
 * @param {string} layer - Active Dev layer.
 * @returns {string} Short display label.
 */
export function formatDevTileValue(tile, layer) {
  if (layer === 'buildable') return tile.buildable ? 'YES' : 'NO';
  if (layer === 'forest') return (tile.forestDensity ?? 0).toFixed(2);
  if (layer.startsWith('ore:')) {
    const oreId = layer.slice(4);
    return (tile.ores?.[oreId] ?? 0).toFixed(2);
  }
  if (layer === 'elevation') return tile.elevation.toFixed(2);
  if (layer === 'temperature') return tile.temperature.toFixed(2);
  if (layer === 'moisture') return tile.moisture.toFixed(2);
  if (layer === 'rock') return (tile.rockType ?? '').slice(0, 3).toUpperCase();
  if (tile.isWater) return 'WTR';
  return (tile.biome ?? '').slice(0, 3).toUpperCase();
}
