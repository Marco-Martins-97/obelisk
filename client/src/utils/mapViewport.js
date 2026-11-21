/**
 * Viewport frustum culling and coordinate conversion helpers for Canvas maps.
 * Ensures only on-screen tiles (+1 tile padding) are rendered.
 */

/**
 * Computes the inclusive [startX..endX, startY..endY] tile range visible in the
 * canvas viewport, padded by `padding` tiles on each edge and clamped to grid bounds.
 *
 * @param {object} params - Viewport state.
 * @param {number} params.offsetX - Canvas X pan offset in pixels.
 * @param {number} params.offsetY - Canvas Y pan offset in pixels.
 * @param {number} params.tileSize - Rendered size of 1 tile in pixels.
 * @param {number} params.canvasWidth - Canvas width in CSS pixels.
 * @param {number} params.canvasHeight - Canvas height in CSS pixels.
 * @param {number} params.gridSize - Total tiles along one axis (N for NxN).
 * @param {number} [params.padding=1] - Extra off-screen tile margin per side.
 * @returns {{ startX: number, endX: number, startY: number, endY: number }} Clamped tile bounds.
 */
export function getVisibleTileRange({
  offsetX,
  offsetY,
  tileSize,
  canvasWidth,
  canvasHeight,
  gridSize,
  padding = 1,
}) {
  if (gridSize <= 0 || tileSize <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return { startX: 0, endX: -1, startY: 0, endY: -1 };
  }

  const rawStartX = Math.floor(-offsetX / tileSize) - padding;
  const rawEndX = Math.floor((canvasWidth - offsetX) / tileSize) + padding;
  const rawStartY = Math.floor(-offsetY / tileSize) - padding;
  const rawEndY = Math.floor((canvasHeight - offsetY) / tileSize) + padding;

  const startX = Math.max(0, rawStartX);
  const endX = Math.min(gridSize - 1, rawEndX);
  const startY = Math.max(0, rawStartY);
  const endY = Math.min(gridSize - 1, rawEndY);

  return { startX, endX, startY, endY };
}

/**
 * Converts a pointer event position on a canvas to integer (x, y) tile coordinates.
 *
 * @param {object} params - Pointer and canvas geometry.
 * @param {number} params.clientX - Mouse clientX.
 * @param {number} params.clientY - Mouse clientY.
 * @param {{ left: number, top: number }} params.rect - Canvas bounding client rect.
 * @param {number} params.offsetX - Canvas X pan offset in pixels.
 * @param {number} params.offsetY - Canvas Y pan offset in pixels.
 * @param {number} params.tileSize - Rendered tile size in pixels.
 * @param {number} params.gridSize - Grid dimension (N).
 * @returns {{ x: number, y: number } | null} Tile coordinates or null if outside grid.
 */
export function screenToTile({
  clientX,
  clientY,
  rect,
  offsetX,
  offsetY,
  tileSize,
  gridSize,
}) {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const x = Math.floor((px - offsetX) / tileSize);
  const y = Math.floor((py - offsetY) / tileSize);

  if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) {
    return null;
  }
  return { x, y };
}

/**
 * Clamps pan offsets so the user can never pan outside the map boundaries.
 *
 * @param {object} params - Viewport bounds.
 * @param {number} params.offsetX - Candidate X pan offset.
 * @param {number} params.offsetY - Candidate Y pan offset.
 * @param {number} params.tileSize - Tile size in pixels.
 * @param {number} params.canvasWidth - Canvas width in pixels.
 * @param {number} params.canvasHeight - Canvas height in pixels.
 * @param {number} params.gridSize - Grid dimension (N).
 * @returns {{ offsetX: number, offsetY: number }} Clamped offsets.
 */
export function clampPanOffsets({
  offsetX,
  offsetY,
  tileSize,
  canvasWidth,
  canvasHeight,
  gridSize,
}) {
  const mapWidth = gridSize * tileSize;
  const mapHeight = gridSize * tileSize;

  const minX = Math.min(0, canvasWidth - mapWidth);
  const minY = Math.min(0, canvasHeight - mapHeight);

  return {
    offsetX: Math.max(minX, Math.min(0, offsetX)),
    offsetY: Math.max(minY, Math.min(0, offsetY)),
  };
}

/**
 * Computes new pan offsets when zooming around an anchor point (e.g., mouse cursor)
 * so the world coordinate under the cursor stays stationary, clamped to map bounds.
 *
 * @param {object} params - Zoom parameters.
 * @param {number} params.prevTileSize - Previous tile size in pixels.
 * @param {number} params.nextTileSize - New clamped tile size in pixels.
 * @param {number} params.offsetX - Previous X pan offset.
 * @param {number} params.offsetY - Previous Y pan offset.
 * @param {number} params.anchorX - Cursor X relative to canvas left.
 * @param {number} params.anchorY - Cursor Y relative to canvas top.
 * @param {number} [params.canvasWidth] - Optional canvas width for pan clamping.
 * @param {number} [params.canvasHeight] - Optional canvas height for pan clamping.
 * @param {number} [params.gridSize] - Optional grid size for pan clamping.
 * @returns {{ offsetX: number, offsetY: number }} Updated pan offsets.
 */
export function zoomAtPoint({
  prevTileSize,
  nextTileSize,
  offsetX,
  offsetY,
  anchorX,
  anchorY,
  canvasWidth,
  canvasHeight,
  gridSize,
}) {
  const worldX = (anchorX - offsetX) / prevTileSize;
  const worldY = (anchorY - offsetY) / prevTileSize;
  const rawX = anchorX - worldX * nextTileSize;
  const rawY = anchorY - worldY * nextTileSize;

  if (canvasWidth && canvasHeight && gridSize) {
    return clampPanOffsets({
      offsetX: rawX,
      offsetY: rawY,
      tileSize: nextTileSize,
      canvasWidth,
      canvasHeight,
      gridSize,
    });
  }

  return { offsetX: rawX, offsetY: rawY };
}
