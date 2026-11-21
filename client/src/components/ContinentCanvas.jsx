import { useEffect, useRef, useState } from 'react';
import { getDevTileColor } from '../utils/mapColors.js';
import {
  clampPanOffsets,
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
} from '../utils/mapViewport.js';
import { drawGameplayMarker, drawSurfaceTile } from '../utils/tileSprites.js';

const CANVAS_SIZE = 320;
const DEFAULT_TILE_SIZE = 32;
const MAX_TILE_SIZE = 48;

/**
 * Computes initial continent viewport at 32px/tile centered around target coords.
 *
 * @param {number} gridSize - Continent size.
 * @param {{ x: number, y: number }} focusCoords - Focus tile.
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }} Initial viewport.
 */
function getInitialViewport(gridSize, focusCoords) {
  const tileSize = Math.max(CANVAS_SIZE / gridSize, DEFAULT_TILE_SIZE);
  const rawX = CANVAS_SIZE * 0.5 - (focusCoords.x + 0.5) * tileSize;
  const rawY = CANVAS_SIZE * 0.5 - (focusCoords.y + 0.5) * tileSize;
  return {
    tileSize,
    ...clampPanOffsets({
      offsetX: rawX,
      offsetY: rawY,
      tileSize,
      canvasWidth: CANVAS_SIZE,
      canvasHeight: CANVAS_SIZE,
      gridSize,
    }),
  };
}

/**
 * Smaller side-panel HTML5 Canvas renderer for the NxN Continent map (32px default tiles).
 * Shows Stone (`rockType`) rather than ores (ores live on Territory).
 *
 * @param {object} props
 * @param {{ size: number, tiles: Array<object>, obeliskCoords: { x: number, y: number } }} props.continent
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {string} props.devLayer
 * @param {boolean} props.highlightUnbuildable
 * @param {boolean} props.showObelisk
 * @param {{ x: number, y: number }} props.selectedCoords
 * @param {(coords: { x: number, y: number }) => void} props.onSelectTile
 * @returns {import('react').JSX.Element}
 */
export default function ContinentCanvas({
  continent,
  viewMode,
  devLayer,
  highlightUnbuildable,
  showObelisk,
  selectedCoords,
  onSelectTile,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const minTileSize = CANVAS_SIZE / continent.size;
  const [viewport, setViewport] = useState(() =>
    getInitialViewport(continent.size, selectedCoords),
  );
  const [hoveredTile, setHoveredTile] = useState(null);

  // Continent has stone only (no ore layers).
  const continentLayer = devLayer.startsWith('ore:') ? 'rock' : devLayer;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const { startX, endX, startY, endY } = getVisibleTileRange({
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      tileSize: viewport.tileSize,
      canvasWidth: CANVAS_SIZE,
      canvasHeight: CANVAS_SIZE,
      gridSize: continent.size,
      padding: 1,
    });

    const { tileSize, offsetX, offsetY } = viewport;

    for (let y = startY; y <= endY; y += 1) {
      const dy = Math.floor(offsetY + y * tileSize);
      const nextDy = Math.floor(offsetY + (y + 1) * tileSize);
      const h = Math.max(1, nextDy - dy);

      for (let x = startX; x <= endX; x += 1) {
        const dx = Math.floor(offsetX + x * tileSize);
        const nextDx = Math.floor(offsetX + (x + 1) * tileSize);
        const w = Math.max(1, nextDx - dx);

        const tile = continent.tiles[y * continent.size + x];

        if (viewMode === 'gameplay') {
          drawSurfaceTile(ctx, tile.biome, dx, dy, Math.max(w, h));
          if (tile.isObelisk) {
            drawGameplayMarker(ctx, 'obelisk', dx, dy, Math.max(w, h));
          }
        } else {
          ctx.fillStyle = getDevTileColor(tile, continentLayer);
          ctx.fillRect(dx, dy, w, h);

          if (highlightUnbuildable && !tile.buildable) {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.6)';
            ctx.fillRect(dx, dy, w, h);
          }

          if (showObelisk && tile.isObelisk) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx + 1, dy + 1, Math.max(2, w - 2), Math.max(2, h - 2));
          }
        }
      }
    }

    if (
      selectedCoords &&
      selectedCoords.x >= startX &&
      selectedCoords.x <= endX &&
      selectedCoords.y >= startY &&
      selectedCoords.y <= endY
    ) {
      const sx = Math.floor(offsetX + selectedCoords.x * tileSize);
      const sy = Math.floor(offsetY + selectedCoords.y * tileSize);
      const sw = Math.max(1, Math.floor(offsetX + (selectedCoords.x + 1) * tileSize) - sx);
      const sh = Math.max(1, Math.floor(offsetY + (selectedCoords.y + 1) * tileSize) - sy);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
    }
  }, [continent, viewMode, continentLayer, highlightUnbuildable, showObelisk, selectedCoords, viewport]);

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const anchorX = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const anchorY = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;

    const factor = e.deltaY < 0 ? 1.2 : 0.85;
    const nextTileSize = Math.max(
      minTileSize,
      Math.min(MAX_TILE_SIZE, Math.round(viewport.tileSize * factor * 100) / 100),
    );
    if (nextTileSize === viewport.tileSize) return;

    const nextOffsets = zoomAtPoint({
      prevTileSize: viewport.tileSize,
      nextTileSize,
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      anchorX,
      anchorY,
      canvasWidth: CANVAS_SIZE,
      canvasHeight: CANVAS_SIZE,
      gridSize: continent.size,
    });

    setViewport({ tileSize: nextTileSize, ...nextOffsets });
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;

    if (dragRef.current.active) {
      const dx = (e.clientX - dragRef.current.startX) * scaleX;
      const dy = (e.clientY - dragRef.current.startY) * scaleY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragRef.current.moved = true;
      }
      const clamped = clampPanOffsets({
        offsetX: dragRef.current.origX + dx,
        offsetY: dragRef.current.origY + dy,
        tileSize: viewport.tileSize,
        canvasWidth: CANVAS_SIZE,
        canvasHeight: CANVAS_SIZE,
        gridSize: continent.size,
      });
      setViewport((prev) => ({
        ...prev,
        ...clamped,
      }));
      return;
    }

    const coords = screenToTile({
      clientX: rect.left + (e.clientX - rect.left) * scaleX,
      clientY: rect.top + (e.clientY - rect.top) * scaleY,
      rect: { left: rect.left, top: rect.top },
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      tileSize: viewport.tileSize,
      gridSize: continent.size,
    });

    setHoveredTile(coords ? continent.tiles[coords.y * continent.size + coords.x] : null);
  };

  const handleMouseUp = (e) => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.active = false;
    if (wasDrag) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;

    const coords = screenToTile({
      clientX: rect.left + (e.clientX - rect.left) * scaleX,
      clientY: rect.top + (e.clientY - rect.top) * scaleY,
      rect: { left: rect.left, top: rect.top },
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      tileSize: viewport.tileSize,
      gridSize: continent.size,
    });

    if (coords) onSelectTile(coords);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-semibold text-slate-200">
          Continent ({continent.size}×{continent.size} · 32px)
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewport(getInitialViewport(continent.size, selectedCoords))}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            Center
          </button>
          <button
            type="button"
            onClick={() => setViewport({ tileSize: minTileSize, offsetX: 0, offsetY: 0 })}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            Fit All
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="relative w-fit max-w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            onWheel={handleWheel}
            onMouseDown={(e) => {
              dragRef.current = {
                active: true,
                moved: false,
                startX: e.clientX,
                startY: e.clientY,
                origX: viewport.offsetX,
                origY: viewport.offsetY,
              };
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              dragRef.current.active = false;
              setHoveredTile(null);
            }}
            className="block aspect-square w-full max-w-[320px] cursor-crosshair select-none"
          />

          {hoveredTile && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-slate-700 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-slate-200 shadow">
              ({hoveredTile.x}, {hoveredTile.y}) · {hoveredTile.biome}
              {viewMode === 'dev' && ` · ${hoveredTile.rockType}`}
              {hoveredTile.isObelisk && ' · ★'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
