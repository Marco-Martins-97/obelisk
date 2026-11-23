import { useEffect, useMemo, useRef, useState } from 'react';
import { getExploredBounds, normalizedTempToCelsius } from '@obelisk/shared';
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
const MAX_TILE_SIZE = 72;

const BUILDING_COLORS = {
  main: { fill: '#f59e0b', badge: 'M' },
  firepit: { fill: '#ea580c', badge: 'FP' },
  house: { fill: '#10b981', badge: 'H' },
  kiln: { fill: '#d97706', badge: 'K' },
};

const TEAM_MARKER_COLORS = {
  gatherer: '#38bdf8', // Blue
  hunter: '#ef4444',   // Red
  mixed: '#f97316',    // Orange
};

/**
 * Computes initial viewport fitting explored bounds (if fog enabled) or full MxM territory.
 *
 * @param {number} gridSize
 * @param {Uint8Array | null} territoryFog
 * @param {boolean} showFog
 * @returns {{ tileSize: number, offsetX: number, offsetY: number }} Viewport state.
 */
function getInitialViewport(gridSize, territoryFog, showFog) {
  const minTileSize = CANVAS_SIZE / gridSize;
  if (showFog && territoryFog) {
    return getViewportForBounds({
      bounds: getExploredBounds(territoryFog, gridSize),
      canvasWidth: CANVAS_SIZE,
      canvasHeight: CANVAS_SIZE,
      gridSize,
      minTileSize,
      maxTileSize: MAX_TILE_SIZE,
      paddingTiles: 1,
    });
  }
  return { tileSize: minTileSize, offsetX: 0, offsetY: 0 };
}

/**
 * Interactive HTML5 Canvas renderer for the MxM Territory map with optional Fog of War,
 * auto-zoom onto explored bounds, building overlays, left-click inspection, and right-click menus.
 *
 * @param {object} props
 * @param {{ size: number, biome: string, rockType: string, tiles: Array<object> }} props.territory
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {string} props.devLayer
 * @param {boolean} props.highlightUnbuildable
 * @param {Uint8Array | null} [props.territoryFog=null]
 * @param {boolean} [props.showFog=true]
 * @param {boolean} [props.coordsOnlyTooltip=false]
 * @param {Array<object>} [props.buildings=[]]
 * @param {Array<object>} [props.activeTasks=[]]
 * @param {{ x: number, y: number } | null} [props.selectedTileCoords=null]
 * @param {(tile: object | null) => void} props.onHoverSubTile
 * @param {(building: object) => void} [props.onSelectBuilding]
 * @param {(payload: { x: number, y: number, tile: object, clientX: number, clientY: number }) => void} [props.onOpenTileMenu]
 * @param {() => void} [props.onSwitchToContinent]
 * @returns {import('react').JSX.Element}
 */
export default function TerritoryCanvas({
  territory,
  viewMode,
  devLayer,
  highlightUnbuildable,
  territoryFog = null,
  showFog = true,
  coordsOnlyTooltip = false,
  buildings = [],
  activeTasks = [],
  selectedTileCoords = null,
  onHoverSubTile,
  onSelectBuilding,
  onOpenTileMenu,
  onSwitchToContinent,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const minTileSize = CANVAS_SIZE / territory.size;
  const [manualViewport, setManualViewport] = useState(null);
  const [hoveredTile, setHoveredTile] = useState(null);

  const exploredBounds = useMemo(
    () => (showFog && territoryFog ? getExploredBounds(territoryFog, territory.size) : null),
    [showFog, territoryFog, territory.size],
  );

  // When no manual pan/zoom override is active, fit viewport automatically to explored bounds.
  const viewport = useMemo(() => {
    if (manualViewport) return manualViewport;
    return getInitialViewport(territory.size, territoryFog, showFog);
  }, [manualViewport, territory.size, territoryFog, showFog]);

  const buildingByCoord = useMemo(() => {
    const map = new Map();
    for (const b of buildings) {
      map.set(`${b.x},${b.y}`, b);
    }
    return map;
  }, [buildings]);

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

        const idx = y * territory.size + x;
        const isShrouded = showFog && territoryFog && territoryFog[idx] !== 1;

        if (isShrouded) {
          ctx.fillStyle = '#090e1a';
          ctx.fillRect(dx, dy, w, h);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx, dy, w, h);
          if (selectedTileCoords && selectedTileCoords.x === x && selectedTileCoords.y === y) {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.strokeRect(dx + 0.5, dy + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
          }
          continue;
        }

        const subTile = territory.tiles[idx];

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

        if (!coordsOnlyTooltip && subTile.inSettlementZone) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
          ctx.fillRect(dx, dy, w, h);
        }

        // Draw placed building marker or under-construction build mark on tile
        const building = buildingByCoord.get(`${x},${y}`);
        if (building) {
          const meta = BUILDING_COLORS[building.buildingId] ?? { fill: '#e2e8f0', badge: 'B' };
          const pad = Math.max(2, Math.floor(Math.min(w, h) * 0.14));
          ctx.fillStyle = building.status === 'constructing' ? 'rgba(245, 158, 11, 0.45)' : meta.fill;
          ctx.fillRect(dx + pad, dy + pad, Math.max(2, w - pad * 2), Math.max(2, h - pad * 2));
          ctx.strokeStyle = building.status === 'constructing' ? '#fbbf24' : '#020617';
          ctx.lineWidth = 2;
          ctx.strokeRect(dx + pad, dy + pad, Math.max(2, w - pad * 2), Math.max(2, h - pad * 2));

          if (w >= 14) {
            ctx.fillStyle = building.status === 'constructing' ? '#fef3c7' : '#020617';
            ctx.font = `bold ${Math.max(8, Math.floor(w * 0.28))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = building.status === 'constructing' ? 'BLD' : meta.badge;
            ctx.fillText(label, dx + w / 2, dy + h / 2);
          }
        }

        // Highlight tiles with active dispatched teams (blue=gatherer, red=hunter, orange=mix)
        const tileTasks = activeTasks.filter((t) => t.x === x && t.y === y);
        const unitTask = tileTasks.find((t) => t.kind === 'unit_action');
        if (unitTask) {
          const markerSize = Math.max(6, Math.floor(Math.min(w, h) * 0.28));
          ctx.fillStyle = TEAM_MARKER_COLORS[unitTask.teamType ?? 'gatherer'] ?? '#38bdf8';
          ctx.fillRect(dx + 2, dy + 2, markerSize, markerSize);
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx + 2, dy + 2, markerSize, markerSize);
        }

        if (selectedTileCoords && selectedTileCoords.x === x && selectedTileCoords.y === y) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx + 0.5, dy + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
        }
      }
    }
  }, [
    territory,
    viewMode,
    devLayer,
    highlightUnbuildable,
    territoryFog,
    showFog,
    coordsOnlyTooltip,
    buildingByCoord,
    activeTasks,
    selectedTileCoords,
    viewport,
    territoryBaseline,
  ]);

  const toCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CANVAS_SIZE / rect.width : 1;
    const scaleY = rect.height > 0 ? CANVAS_SIZE / rect.height : 1;
    return screenToTile({
      clientX: rect.left + (e.clientX - rect.left) * scaleX,
      clientY: rect.top + (e.clientY - rect.top) * scaleY,
      rect: { left: rect.left, top: rect.top },
      offsetX: viewport.offsetX,
      offsetY: viewport.offsetY,
      tileSize: viewport.tileSize,
      gridSize: territory.size,
    });
  };

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
      gridSize: territory.size,
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
        gridSize: territory.size,
      });
      setManualViewport({
        tileSize: viewport.tileSize,
        ...clamped,
      });
      return;
    }

    const coords = toCoords(e);
    const found = coords ? territory.tiles[coords.y * territory.size + coords.x] : null;
    setHoveredTile(found);
    onHoverSubTile?.(found);
  };

  const handleMouseUp = (e) => {
    const wasDrag = dragRef.current.moved;
    const wasLeftButton = e.button === 0;
    dragRef.current.active = false;
    if (wasDrag || !wasLeftButton) return;

    const coords = toCoords(e);
    if (!coords) return;
    const idx = coords.y * territory.size + coords.x;
    const isShrouded = showFog && territoryFog && territoryFog[idx] !== 1;
    if (isShrouded) return;

    const building = buildingByCoord.get(`${coords.x},${coords.y}`);
    if (building) {
      onSelectBuilding?.(building);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const coords = toCoords(e);
    if (!coords) return;
    const tile = territory.tiles[coords.y * territory.size + coords.x];
    onOpenTileMenu?.({
      x: coords.x,
      y: coords.y,
      tile,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  const hoveredShrouded =
    hoveredTile &&
    showFog &&
    territoryFog &&
    territoryFog[hoveredTile.y * territory.size + hoveredTile.x] !== 1;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-slate-200">
            Territory ({territory.size}×{territory.size})
          </h2>
          {exploredBounds && (
            <span className="font-mono text-[11px] text-amber-300">
              Explored: {exploredBounds.exploredCount}/{territory.size * territory.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="hidden sm:inline">Left-click building · Right-click tile</span>
          {onSwitchToContinent && (
            <button
              type="button"
              onClick={onSwitchToContinent}
              className="rounded border border-amber-500/60 bg-amber-500/15 px-2.5 py-0.5 font-semibold text-amber-300 hover:bg-amber-500/25"
            >
              Continent Map
            </button>
          )}
          <button
            type="button"
            onClick={() => setManualViewport(null)}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            {showFog && territoryFog ? 'Fit Explored' : 'Reset View'}
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
            aria-label="Territory Map Canvas"
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
              onHoverSubTile?.(null);
            }}
            className="block aspect-square w-full max-w-[672px] cursor-crosshair select-none"
          />

          {hoveredTile && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 shadow">
              ({hoveredTile.x}, {hoveredTile.y})
              {!coordsOnlyTooltip && !hoveredShrouded && (
                <>
                  {hoveredTile.inSettlementZone && ' · Settlement (7×7)'}
                  {hoveredTile.isWater ? ` · Water (${hoveredTile.waterType})` : ''}
                  {viewMode === 'dev' &&
                    ` · E:${hoveredTile.elevation.toFixed(2)} T:${normalizedTempToCelsius(hoveredTile.temperature)}°C For:${hoveredTile.forestDensity.toFixed(2)}`}
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
