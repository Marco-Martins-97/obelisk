import { useEffect, useMemo, useRef, useState } from 'react';
import { getExploredBounds } from '@obelisk/shared';
import { getDevTileColor } from '../utils/mapColors.js';
import {
  clampPanOffsets,
  getViewportForBounds,
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
} from '../utils/mapViewport.js';
import { drawGameplayMarker, drawSurfaceTile } from '../utils/tileSprites.js';

const CANVAS_SIZE = 672;
const DEFAULT_TILE_SIZE = 48;
const MAX_TILE_SIZE = 72;

/**
 * Computes initial continent viewport fitting explored bounds (when fogged) or centering focus coords.
 *
 * @param {number} gridSize
 * @param {{ x: number, y: number }} focusCoords
 * @param {Uint8Array | null} continentFog
 * @param {boolean} showFog
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }} Initial viewport.
 */
function getInitialViewport(gridSize, focusCoords, continentFog, showFog) {
  const minTileSize = CANVAS_SIZE / gridSize;
  if (showFog && continentFog) {
    return getViewportForBounds({
      bounds: getExploredBounds(continentFog, gridSize),
      canvasWidth: CANVAS_SIZE,
      canvasHeight: CANVAS_SIZE,
      gridSize,
      minTileSize,
      maxTileSize: MAX_TILE_SIZE,
      paddingTiles: 1,
    });
  }

  const tileSize = Math.max(minTileSize, DEFAULT_TILE_SIZE);
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
 * Full-size HTML5 Canvas renderer for the NxN Continent map with optional Fog of War,
 * auto-zoom on explored bounds (1 tile -> 3x3 ring -> expeditions), 1px black selection highlight,
 * and toggle button back to Territory Map.
 *
 * @param {object} props
 * @param {{ size: number, tiles: Array<object>, obeliskCoords: { x: number, y: number } }} props.continent
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {string} props.devLayer
 * @param {boolean} props.highlightUnbuildable
 * @param {boolean} props.showObelisk
 * @param {Uint8Array | null} [props.continentFog=null]
 * @param {boolean} [props.showFog=true]
 * @param {boolean} [props.coordsOnlyTooltip=false]
 * @param {{ x: number, y: number } | null} [props.villageCoords=null]
 * @param {{ x: number, y: number }} props.selectedCoords
 * @param {(coords: { x: number, y: number }) => void} [props.onSelectTile]
 * @param {(payload: { x: number, y: number, tile: object, clientX: number, clientY: number }) => void} [props.onOpenTileMenu]
 * @param {() => void} [props.onSwitchToTerritory]
 * @returns {import('react').JSX.Element}
 */
export default function ContinentCanvas({
  continent,
  viewMode,
  devLayer,
  highlightUnbuildable,
  showObelisk,
  continentFog = null,
  showFog = true,
  coordsOnlyTooltip = false,
  villageCoords = null,
  selectedCoords,
  onSelectTile,
  onOpenTileMenu,
  onSwitchToTerritory,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const minTileSize = CANVAS_SIZE / continent.size;
  const [manualViewport, setManualViewport] = useState(null);
  const [hoveredTile, setHoveredTile] = useState(null);

  const exploredBounds = useMemo(
    () => (showFog && continentFog ? getExploredBounds(continentFog, continent.size) : null),
    [showFog, continentFog, continent.size],
  );

  const viewport = useMemo(() => {
    if (manualViewport) return manualViewport;
    return getInitialViewport(continent.size, selectedCoords, continentFog, showFog);
  }, [manualViewport, continent.size, selectedCoords, continentFog, showFog]);

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

        const idx = y * continent.size + x;
        const isShrouded = showFog && continentFog && continentFog[idx] !== 1;

        if (isShrouded) {
          ctx.fillStyle = '#090e1a';
          ctx.fillRect(dx, dy, w, h);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx, dy, w, h);
          continue;
        }

        const tile = continent.tiles[idx];

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

        if (villageCoords && x === villageCoords.x && y === villageCoords.y) {
          const pad = Math.max(2, Math.floor(Math.min(w, h) * 0.2));
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(dx + pad, dy + pad, Math.max(3, w - pad * 2), Math.max(3, h - pad * 2));
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
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(1, sw - 1), Math.max(1, sh - 1));
    }
  }, [
    continent,
    viewMode,
    continentLayer,
    highlightUnbuildable,
    showObelisk,
    continentFog,
    showFog,
    villageCoords,
    selectedCoords,
    viewport,
  ]);

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const anchorX = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE : e.clientX;
    const anchorY = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE : e.clientY;

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

    setManualViewport({ tileSize: nextTileSize, ...nextOffsets });
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CANVAS_SIZE / rect.width : 1;
    const scaleY = rect.height > 0 ? CANVAS_SIZE / rect.height : 1;

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
      setManualViewport({
        tileSize: viewport.tileSize,
        ...clamped,
      });
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
    if (wasDrag || e.button !== 0 || !onSelectTile) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CANVAS_SIZE / rect.width : 1;
    const scaleY = rect.height > 0 ? CANVAS_SIZE / rect.height : 1;

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

  const handleContextMenu = (e) => {
    if (!onOpenTileMenu) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CANVAS_SIZE / rect.width : 1;
    const scaleY = rect.height > 0 ? CANVAS_SIZE / rect.height : 1;

    const coords = screenToTile({
      clientX: rect.left + (e.clientX - rect.left) * scaleX,
      clientY: rect.top + (e.clientY - rect.top) * scaleY,
      rect: { left: rect.left, top: rect.top },
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      tileSize: viewport.tileSize,
      gridSize: continent.size,
    });

    if (coords) {
      onOpenTileMenu({
        x: coords.x,
        y: coords.y,
        tile: continent.tiles[coords.y * continent.size + coords.x],
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
  };

  const hoveredShrouded =
    hoveredTile &&
    showFog &&
    continentFog &&
    continentFog[hoveredTile.y * continent.size + hoveredTile.x] !== 1;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-200">
            Continent ({continent.size}×{continent.size})
          </h2>
          {exploredBounds && (
            <span className="font-mono text-[11px] text-amber-300">
              Explored: {exploredBounds.exploredCount}/{continent.size * continent.size}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          {onSwitchToTerritory && (
            <button
              type="button"
              onClick={onSwitchToTerritory}
              className="rounded border border-amber-500/60 bg-amber-500/15 px-2.5 py-0.5 font-semibold text-amber-300 hover:bg-amber-500/25"
            >
              Territory Map
            </button>
          )}
          <button
            type="button"
            onClick={() => setManualViewport(null)}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            {showFog && continentFog ? 'Fit Explored' : 'Center'}
          </button>
          <button
            type="button"
            onClick={() => setManualViewport({ tileSize: minTileSize, offsetX: 0, offsetY: 0 })}
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
            aria-label="Continent Map Canvas"
            onWheel={handleWheel}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
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
            onContextMenu={handleContextMenu}
            onMouseLeave={() => {
              dragRef.current.active = false;
              setHoveredTile(null);
            }}
            className="block aspect-square w-full max-w-[672px] cursor-crosshair select-none"
          />

          {hoveredTile && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 shadow">
              ({hoveredTile.x}, {hoveredTile.y})
              {!coordsOnlyTooltip && !hoveredShrouded && (
                <>
                  {' '}
                  · {hoveredTile.biome}
                  {viewMode === 'dev' && ` · ${hoveredTile.rockType}`}
                  {hoveredTile.isObelisk && ' · ★'}
                </>
              )}
              {coordsOnlyTooltip && hoveredShrouded ? ' · Fog' : ''}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
