import { BIOMES } from '@obelisk/shared';

/**
 * Offscreen 16x16 surface tile sprite cache for Gameplay View.
 * Allows instant Canvas blitting now and clean swap-in of PNG sprite sheets later.
 */

const SPRITE_SIZE = 16;
const spriteCache = new Map();

/**
 * Builds a deterministic 16x16 offscreen canvas sprite for a given surface key.
 *
 * @param {string} key - Biome, waterType, or feature key.
 * @returns {HTMLCanvasElement} Offscreen canvas sprite.
 */
function buildSprite(key) {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d');

  // Base fill
  const baseColor =
    key === 'lake'
      ? '#1d4ed8'
      : key === 'river'
        ? '#0284c7'
        : key === 'spring'
          ? '#38bdf8'
          : (BIOMES[key]?.color ?? '#475569');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  // Subtle pixel-art surface texture per terrain type
  if (key === 'ocean' || key === 'lake' || key === 'river' || key === 'spring') {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(2, 4, 5, 1);
    ctx.fillRect(9, 11, 5, 1);
  } else if (key === 'temperate_forest' || key === 'taiga' || key === 'tropical_forest') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.fillRect(4, 3, 4, 4);
    ctx.fillRect(10, 9, 4, 4);
    ctx.fillStyle = 'rgba(134, 239, 172, 0.22)';
    ctx.fillRect(5, 2, 2, 2);
    ctx.fillRect(11, 8, 2, 2);
  } else if (key === 'mountain') {
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.moveTo(2, 14);
    ctx.lineTo(8, 3);
    ctx.lineTo(14, 14);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(6, 7);
    ctx.lineTo(8, 3);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();
  } else if (key === 'desert' || key === 'savanna') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(2, 6, 7, 1);
    ctx.fillRect(7, 12, 6, 1);
  } else {
    // Grassland / tundra speckles
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(3, 5, 2, 1);
    ctx.fillRect(11, 10, 2, 1);
  }

  return canvas;
}

/**
 * Draws a cached surface tile sprite at (dx, dy, size, size).
 *
 * @param {CanvasRenderingContext2D} ctx - Target 2D context.
 * @param {string} key - Biome or water key.
 * @param {number} dx - Destination X in pixels.
 * @param {number} dy - Destination Y in pixels.
 * @param {number} size - Destination tile size in pixels.
 */
export function drawSurfaceTile(ctx, key, dx, dy, size) {
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = buildSprite(key);
    spriteCache.set(key, sprite);
  }
  ctx.drawImage(sprite, dx, dy, size, size);
}

/**
 * Draws a crisp Gameplay-view resource node or Obelisk icon inside a tile.
 *
 * @param {CanvasRenderingContext2D} ctx - Target 2D context.
 * @param {'obelisk' | 'ore_vein' | 'surface_rock' | 'timber' | 'wild_crop'} kind - Marker kind.
 * @param {number} dx - Tile top-left X in pixels.
 * @param {number} dy - Tile top-left Y in pixels.
 * @param {number} size - Tile size in pixels.
 */
export function drawGameplayMarker(ctx, kind, dx, dy, size) {
  const pad = Math.max(1, size * 0.18);
  const inner = Math.max(2, size - pad * 2);

  if (kind === 'obelisk') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(dx + pad, dy + pad, inner, inner);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(dx + size * 0.38, dy + size * 0.18, size * 0.24, size * 0.64);
    return;
  }

  if (kind === 'ore_vein') {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(dx + pad, dy + pad, inner, inner);
  } else if (kind === 'surface_rock') {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(dx + pad, dy + pad, inner, inner);
  } else if (kind === 'timber') {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(dx + pad, dy + pad, inner, inner);
  } else if (kind === 'wild_crop') {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(dx + pad, dy + pad, inner, inner);
  }
}
