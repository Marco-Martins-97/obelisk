import { describe, expect, it } from 'vitest';
import {
  clampPanOffsets,
  getViewportForBounds,
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
} from './mapViewport.js';
import { formatDevTileValue, getDevTileColor } from './mapColors.js';

describe('Stage 2: Map Viewport Frustum Culling & Dev Colors', () => {
  it('culls off-screen tiles and keeps exactly +1 tile padding around the viewport', () => {
    // 500x500 canvas with 20px tiles = 25 visible tiles wide (indices 10..34)
    // With padding = 1, range must be 9..35.
    const range = getVisibleTileRange({
      offsetX: -200,
      offsetY: -200,
      tileSize: 20,
      canvasWidth: 500,
      canvasHeight: 500,
      gridSize: 100,
      padding: 1,
    });

    expect(range).toEqual({
      startX: 9,
      endX: 36,
      startY: 9,
      endY: 36,
    });
  });

  it('clamps visible tile range to [0, gridSize - 1]', () => {
    const range = getVisibleTileRange({
      offsetX: 100,
      offsetY: 100,
      tileSize: 50,
      canvasWidth: 600,
      canvasHeight: 600,
      gridSize: 10,
      padding: 1,
    });

    expect(range).toEqual({
      startX: 0,
      endX: 9,
      startY: 0,
      endY: 9,
    });
  });

  it('converts screen coordinates to tile coordinates and returns null outside grid', () => {
    const rect = { left: 10, top: 20 };
    expect(
      screenToTile({
        clientX: 35,
        clientY: 45,
        rect,
        offsetX: 0,
        offsetY: 0,
        tileSize: 10,
        gridSize: 25,
      }),
    ).toEqual({ x: 2, y: 2 });

    expect(
      screenToTile({
        clientX: 5,
        clientY: 25,
        rect,
        offsetX: 0,
        offsetY: 0,
        tileSize: 10,
        gridSize: 25,
      }),
    ).toBeNull();
  });

  it('preserves world coordinate under anchor point when zooming', () => {
    const next = zoomAtPoint({
      prevTileSize: 10,
      nextTileSize: 20,
      offsetX: 0,
      offsetY: 0,
      anchorX: 100,
      anchorY: 100,
    });

    expect(next).toEqual({ offsetX: -100, offsetY: -100 });
  });

  it('clamps pan offsets so the viewport cannot leave map boundaries', () => {
    // 100 tiles * 10px = 1000px map inside 560px canvas -> offsetX must stay in [-440, 0].
    expect(
      clampPanOffsets({
        offsetX: 50,
        offsetY: -800,
        tileSize: 10,
        canvasWidth: 560,
        canvasHeight: 560,
        gridSize: 100,
      }),
    ).toEqual({ offsetX: 0, offsetY: -440 });
  });

  it('returns valid Dev colors including grayscale elevation (higher = darker)', () => {
    const tile = {
      elevation: 0.55,
      temperature: 0.42,
      moisture: 0.71,
      ores: { tin: 0.35, gold: 0.88 },
      forestDensity: 0.64,
      rockType: 'granite',
      biome: 'temperate_forest',
      buildable: true,
      isWater: false,
    };

    expect(getDevTileColor(tile, 'elevation')).toMatch(/^rgb\(/);
    // Low elevation should be lighter (higher RGB sum) than high elevation.
    const lowColor = getDevTileColor({ ...tile, elevation: 0.1 }, 'elevation');
    const highColor = getDevTileColor({ ...tile, elevation: 0.9 }, 'elevation');
    const rgbSum = (c) => c.match(/\d+/g).reduce((s, n) => s + Number(n), 0);
    expect(rgbSum(lowColor)).toBeGreaterThan(rgbSum(highColor));

    expect(getDevTileColor(tile, 'temperature')).toMatch(/^rgb\(/);
    expect(getDevTileColor(tile, 'moisture')).toMatch(/^rgb\(/);
    expect(getDevTileColor(tile, 'rock')).toBe('#c08484');
    expect(getDevTileColor(tile, 'ore:gold')).toMatch(/^rgb\(/);
    expect(getDevTileColor(tile, 'forest')).toMatch(/^rgb\(/);
    expect(formatDevTileValue(tile, 'elevation')).toBe('0.55');
    expect(formatDevTileValue(tile, 'ore:gold')).toBe('0.88');
  });

  it('auto-zooms centered 7x7 starter bounds and widens gracefully when explored area grows', () => {
    const starterView = getViewportForBounds({
      bounds: { minX: 9, maxX: 15, minY: 9, maxY: 15, width: 7, height: 7, exploredCount: 49 },
      canvasWidth: 672,
      canvasHeight: 672,
      gridSize: 25,
      minTileSize: 672 / 25,
      maxTileSize: 72,
      paddingTiles: 1,
    });
    expect(starterView.tileSize).toBe(72);

    const widerView = getViewportForBounds({
      bounds: { minX: 4, maxX: 20, minY: 4, maxY: 20, width: 17, height: 17, exploredCount: 289 },
      canvasWidth: 672,
      canvasHeight: 672,
      gridSize: 25,
      minTileSize: 672 / 25,
      maxTileSize: 72,
      paddingTiles: 1,
    });
    expect(widerView.tileSize).toBeLessThan(starterView.tileSize);
    expect(widerView.tileSize).toBeGreaterThanOrEqual(672 / 25);
  });
});
