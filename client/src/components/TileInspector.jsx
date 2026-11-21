import { BIOMES, ROCK_TYPES } from '@obelisk/shared';

/**
 * Side inspector showing selected Continent tile metadata, hosted ores,
 * and hovered Territory sub-tile details.
 *
 * @param {object} props
 * @param {object | null} props.selectedTile
 * @param {object | null} props.hoveredSubTile
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {import('react').ReactNode} props.children - TerritoryCanvas slot.
 * @returns {import('react').JSX.Element}
 */
export default function TileInspector({
  selectedTile,
  hoveredSubTile,
  viewMode,
  children,
}) {
  const rockInfo = selectedTile
    ? ROCK_TYPES.find((r) => r.id === selectedTile.rockType)
    : null;
  const biomeName = selectedTile ? (BIOMES[selectedTile.biome]?.name ?? selectedTile.biome) : '';

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      {selectedTile ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-100">
              World Tile ({selectedTile.x}, {selectedTile.y})
            </h2>
            {selectedTile.isObelisk && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                Obelisk
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-950/70 p-2.5 font-mono text-[11px]">
            <dt className="text-slate-400">Biome</dt>
            <dd className="text-slate-100">{biomeName}</dd>
            <dt className="text-slate-400">Rock Layer</dt>
            <dd className="text-slate-100">{rockInfo?.name ?? selectedTile.rockType}</dd>
            <dt className="text-slate-400">Ores</dt>
            <dd className="text-amber-300">{rockInfo?.ores.join(', ') ?? 'none'}</dd>
            <dt className="text-slate-400">Buildable</dt>
            <dd className={selectedTile.buildable ? 'text-emerald-400' : 'text-rose-400'}>
              {selectedTile.buildable ? 'Yes' : 'No'}
            </dd>

            {viewMode === 'dev' && (
              <>
                <dt className="text-slate-400">Elevation</dt>
                <dd className="text-slate-100">{selectedTile.elevation.toFixed(3)}</dd>
                <dt className="text-slate-400">Temperature</dt>
                <dd className="text-slate-100">{selectedTile.temperature.toFixed(3)}</dd>
                <dt className="text-slate-400">Moisture</dt>
                <dd className="text-slate-100">{selectedTile.moisture.toFixed(3)}</dd>
                <dt className="text-slate-400">tileSeed</dt>
                <dd className="text-sky-300">0x{selectedTile.tileSeed.toString(16)}</dd>
              </>
            )}
          </dl>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Select a world tile to view details.</p>
      )}

      {children}

      {hoveredSubTile && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 font-mono text-[11px] text-slate-200">
          <div>
            Sub-tile ({hoveredSubTile.x}, {hoveredSubTile.y})
            {hoveredSubTile.inSettlementZone && ' · Settlement Zone (7×7)'}
          </div>
          <div className="text-slate-400">
            {hoveredSubTile.isWater
              ? `Water: ${hoveredSubTile.waterType}`
              : hoveredSubTile.forestDensity >= 0.52
                ? 'Forest canopy'
                : 'Open terrain'}
          </div>
          {viewMode === 'dev' && (
            <div className="mt-1 space-y-0.5 text-sky-300">
              <div>
                E:{hoveredSubTile.elevation.toFixed(2)} T:{hoveredSubTile.temperature.toFixed(2)} M:
                {hoveredSubTile.moisture.toFixed(2)} · For:{hoveredSubTile.forestDensity.toFixed(2)} ·{' '}
                {hoveredSubTile.buildable ? 'Buildable' : 'Blocked'}
              </div>
              <div className="text-amber-300">
                Ores:{' '}
                {Object.entries(hoveredSubTile.ores)
                  .map(([id, val]) => `${id}:${Math.round(val * 100)}%`)
                  .join(' · ')}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
