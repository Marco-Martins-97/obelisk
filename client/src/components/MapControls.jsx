import { useState } from 'react';
import { ORES } from '@obelisk/shared';

const BASE_DEV_LAYERS = [
  { id: 'biome', label: 'Biome' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'moisture', label: 'Moisture' },
  { id: 'rock', label: 'Stone' },
  { id: 'forest', label: 'Forest' },
];

/**
 * Top control bar for switching between Gameplay and Dev map views,
 * toggling Dev data layers (including per-ore Territory layers), and configuring seed & sizes.
 *
 * @param {object} props
 * @param {string} props.seed
 * @param {(nextSeed: string) => void} props.onApplySeed
 * @param {() => void} props.onRandomizeSeed
 * @param {number} props.continentSize
 * @param {(size: number) => void} props.onContinentSizeChange
 * @param {number} props.territorySize
 * @param {(size: number) => void} props.onTerritorySizeChange
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {(mode: 'gameplay' | 'dev') => void} props.onViewModeChange
 * @param {string} props.devLayer
 * @param {(layer: string) => void} props.onDevLayerChange
 * @param {Array<string>} props.availableOres - Ores hosted by the selected tile's rockType.
 * @param {boolean} props.highlightUnbuildable
 * @param {(show: boolean) => void} props.onToggleUnbuildable
 * @param {boolean} props.showObelisk
 * @param {(show: boolean) => void} props.onToggleObelisk
 * @returns {import('react').JSX.Element}
 */
export default function MapControls({
  seed,
  onApplySeed,
  onRandomizeSeed,
  continentSize,
  onContinentSizeChange,
  territorySize,
  onTerritorySizeChange,
  viewMode,
  onViewModeChange,
  devLayer,
  onDevLayerChange,
  availableOres,
  highlightUnbuildable,
  onToggleUnbuildable,
  showObelisk,
  onToggleObelisk,
}) {
  const [draftSeed, setDraftSeed] = useState(seed);

  if (draftSeed !== seed && document.activeElement?.id !== 'world-seed-input') {
    setDraftSeed(seed);
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = draftSeed.trim();
    if (cleaned) onApplySeed(cleaned);
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-amber-400">Obelisk</h1>

          <div
            className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs"
            role="group"
            aria-label="Map view mode"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'gameplay'}
              onClick={() => onViewModeChange('gameplay')}
              className={`rounded-md px-3 py-1 font-medium transition ${
                viewMode === 'gameplay'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Gameplay
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'dev'}
              onClick={() => onViewModeChange('dev')}
              className={`rounded-md px-3 py-1 font-medium transition ${
                viewMode === 'dev'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Dev
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="world-seed-input" className="text-slate-400">
            Seed
          </label>
          <input
            id="world-seed-input"
            type="text"
            value={draftSeed}
            onChange={(e) => setDraftSeed(e.target.value)}
            className="w-36 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-slate-100 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-800 px-2.5 py-1 font-medium text-slate-100 hover:bg-slate-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onRandomizeSeed}
            className="rounded-md border border-slate-700 px-2.5 py-1 font-medium text-slate-200 hover:bg-slate-800"
          >
            Randomize
          </button>

          <label htmlFor="continent-size-input" className="ml-2 text-slate-400">
            Continent
          </label>
          <input
            id="continent-size-input"
            type="number"
            min={10}
            max={300}
            value={continentSize}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isInteger(val) && val >= 10 && val <= 300) onContinentSizeChange(val);
            }}
            className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
          />

          <label htmlFor="territory-size-input" className="text-slate-400">
            Territory
          </label>
          <input
            id="territory-size-input"
            type="number"
            min={9}
            max={75}
            value={territorySize}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (Number.isInteger(val) && val >= 9 && val <= 75) onTerritorySizeChange(val);
            }}
            className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
          />
        </form>
      </div>

      {viewMode === 'dev' && (
        <div className="mx-auto mt-2.5 flex max-w-7xl flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Layer:</span>
          {BASE_DEV_LAYERS.map((layer) => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={devLayer === layer.id}
              onClick={() => onDevLayerChange(layer.id)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                devLayer === layer.id
                  ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {layer.label}
            </button>
          ))}

          <span className="ml-2 text-slate-400">Ores:</span>
          {availableOres.map((oreId) => {
            const layerId = `ore:${oreId}`;
            const oreName = ORES[oreId]?.name ?? oreId;
            return (
              <button
                key={layerId}
                type="button"
                aria-pressed={devLayer === layerId}
                onClick={() => onDevLayerChange(layerId)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  devLayer === layerId
                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {oreName}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300">
              <input
                type="checkbox"
                checked={highlightUnbuildable}
                onChange={(e) => onToggleUnbuildable(e.target.checked)}
                className="accent-rose-500"
              />
              Unbuildable (60% Red)
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-300">
              <input
                type="checkbox"
                checked={showObelisk}
                onChange={(e) => onToggleObelisk(e.target.checked)}
                className="accent-amber-400"
              />
              Show Obelisk Marker
            </label>
          </div>
        </div>
      )}
    </header>
  );
}
