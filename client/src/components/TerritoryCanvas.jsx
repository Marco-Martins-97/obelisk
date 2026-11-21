import { useEffect, useMemo, useRef, useState } from 'react';
import { getDevTileColor } from '../utils/mapColors.js';
import {
  clampPanOffsets,
  getVisibleTileRange,
  screenToTile,
  zoomAtPoint,
} from '../utils/mapViewport.js';
import { drawGameplayMarker, drawSurfaceTile } from '../utils/tileSprites.js';

const CANVAS_SIZE = 672;
const MAX_TILE_SIZE = 72;

/**
 * Computes initial viewport fitting the full MxM territory by default.
 *
 * @param {number} gridSize - Territory grid dimension.
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }} Initial viewport.
 */
function getInitialViewport(gridSize) {
  return {
    tileSize: CANVAS_SIZE / gridSize,
    offsetX: 0,
    offsetY: 0,
  };
}

/**
 * Main, larger interactive HTML5 Canvas renderer for the MxM Territory map.
 * Renders only on-screen tiles (+1 padding) and clamps pan/zoom to map bounds.
 *
 * @param {object} props
 * @param {{ size: number, biome: string, rockType: string, tiles: Array<object> }} props.territory
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {string} props.devLayer
 * @param {boolean} props.highlightUnbuildable
 * @param {(tile: object | null) => void} props.onHoverSubTile
 * @returns {import('react').JSX.Element}
 */
export default function TerritoryCanvas({
  territory,
  viewMode,
  devLayer,
  highlightUnbuildable,
  onHoverSubTile,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const minTileSize = CANVAS_SIZE / territory.size;
  const [viewport, setViewport] = useState(() => getInitialViewport(territory.size));
  const [hoveredTile, setHoveredTile] = useState(null);

  // Compute territory baseline means so Dev View amplifies subtle local gradients by 10x.
  const territoryBaseline = useMemo(() => {
    const count = territory.tiles.length || 1;
    let e = 0;
    let t = 0;
    let m = 0;
    for (const tile of territory.tiles) {
      e += tile.elevation;
      t += tile.temperature;
      m += tile.moisture;
    }
    return { elevation: e / count, temperature: t / count, moisture: m / count };
  }, [territory.tiles]);

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
      gridSize: territory.size,
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

        const subTile = territory.tiles[y * territory.size + x];

        if (viewMode === 'gameplay') {
          const surfaceKey = subTile.isWater ? subTile.waterType : territory.biome;
          drawSurfaceTile(ctx, surfaceKey, dx, dy, Math.max(w, h));

          if (!subTile.isWater && subTile.forestDensity >= 0.52) {
            drawGameplayMarker(ctx, 'timber', dx, dy, Math.max(w, h));
          }
        } else {
          const enriched = {
            ...subTile,
            biome: territory.biome,
            rockType: territory.rockType,
          };
          ctx.fillStyle = getDevTileColor(enriched, devLayer, {
            scale: devLayer === 'moisture' ? 1 : 10,
            baseline: territoryBaseline,
          });
          ctx.fillRect(dx, dy, w, h);

          if (highlightUnbuildable && !subTile.buildable) {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.6)';
            ctx.fillRect(dx, dy, w, h);
          }
        }

        if (subTile.inSettlementZone) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
          ctx.fillRect(dx, dy, w, h);
        }
      }
    }
  }, [territory, viewMode, devLayer, highlightUnbuildable, viewport, territoryBaseline]);

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
      gridSize: territory.size,
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
      const clamped = clampPanOffsets({
        offsetX: dragRef.current.origX + dx,
        offsetY: dragRef.current.origY + dy,
        tileSize: viewport.tileSize,
        canvasWidth: CANVAS_SIZE,
        canvasHeight: CANVAS_SIZE,
        gridSize: territory.size,
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
      gridSize: territory.size,
    });

    const found = coords ? territory.tiles[coords.y * territory.size + coords.x] : null;
    setHoveredTile(found);
    onHoverSubTile(found);
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <h2 className="font-semibold text-slate-200">
          Territory Terrain ({territory.size}×{territory.size} · 48px tiles)
        </h2>
        <div className="flex items-center gap-3 text-slate-400">
          <span>Scroll to zoom · Drag to pan</span>
          <button
            type="button"
            onClick={() => setViewport(getInitialViewport(territory.size))}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            Reset View
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
                startX: e.clientX,
                startY: e.clientY,
                origX: viewport.offsetX,
                origY: viewport.offsetY,
              };
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => {
              dragRef.current.active = false;
            }}
            onMouseLeave={() => {
              dragRef.current.active = false;
              setHoveredTile(null);
              onHoverSubTile(null);
            }}
            className="block aspect-square w-full max-w-[672px] cursor-crosshair select-none"
          />

          {hoveredTile && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 shadow">
              ({hoveredTile.x}, {hoveredTile.y})
              {hoveredTile.inSettlementZone && ' · Settlement (7×7)'}
              {hoveredTile.isWater ? ` · Water (${hoveredTile.waterType})` : ''}
              {viewMode === 'dev' &&
                ` · E:${hoveredTile.elevation.toFixed(2)} For:${hoveredTile.forestDensity.toFixed(2)}`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
