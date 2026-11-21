import { useMemo, useState } from 'react';
import {
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  ROCK_TYPES,
  generateContinent,
  generateTerritory,
  getWorldTileContext,
} from '@obelisk/shared';
import ContinentCanvas from './components/ContinentCanvas.jsx';
import MapControls from './components/MapControls.jsx';
import TerritoryCanvas from './components/TerritoryCanvas.jsx';
import TileInspector from './components/TileInspector.jsx';

/**
 * Stage 2 Map Viewport & Dev Visualizer.
 * Territory (48px tiles) is the primary main map; Continent (32px tiles) + Inspector sit in the sidebar.
 *
 * @returns {import('react').JSX.Element}
 */
export default function App() {
  const [seed, setSeed] = useState('obelisk-alpha');
  const [continentSize, setContinentSize] = useState(DEFAULT_CONTINENT_SIZE);
  const [territorySize, setTerritorySize] = useState(DEFAULT_TERRITORY_SIZE);
  const [viewMode, setViewMode] = useState('gameplay');
  const [devLayer, setDevLayer] = useState('biome');
  const [highlightUnbuildable, setHighlightUnbuildable] = useState(false);
  const [showObelisk, setShowObelisk] = useState(true);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [hoveredSubTile, setHoveredSubTile] = useState(null);

  const continent = useMemo(
    () => generateContinent(seed, { size: continentSize }),
    [seed, continentSize],
  );

  const activeCoords =
    selectedCoords &&
    selectedCoords.x < continent.size &&
    selectedCoords.y < continent.size
      ? selectedCoords
      : continent.obeliskCoords;

  const selectedTile = continent.tiles[activeCoords.y * continent.size + activeCoords.x];
  const rockInfo = ROCK_TYPES.find((r) => r.id === selectedTile.rockType) ?? ROCK_TYPES[0];
  const availableOres = rockInfo.ores;

  // Reset ore-specific Dev layer if the newly selected tile's rockType doesn't host it.
  const activeDevLayer =
    devLayer.startsWith('ore:') && !availableOres.includes(devLayer.slice(4))
      ? `ore:${availableOres[0]}`
      : devLayer;

  const territory = useMemo(() => {
    const context = getWorldTileContext(continent, activeCoords.x, activeCoords.y);
    return generateTerritory(selectedTile.tileSeed, context, { size: territorySize });
  }, [continent, activeCoords.x, activeCoords.y, selectedTile.tileSeed, territorySize]);

  const handleRandomizeSeed = () => {
    const randomSuffix = Math.floor(Date.now() % 1000000).toString(36);
    setSeed(`obelisk-${randomSuffix}`);
    setSelectedCoords(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <MapControls
        seed={seed}
        onApplySeed={(next) => {
          setSeed(next);
          setSelectedCoords(null);
        }}
        onRandomizeSeed={handleRandomizeSeed}
        continentSize={continentSize}
        onContinentSizeChange={(size) => {
          setContinentSize(size);
          setSelectedCoords(null);
        }}
        territorySize={territorySize}
        onTerritorySizeChange={setTerritorySize}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        devLayer={activeDevLayer}
        onDevLayerChange={setDevLayer}
        availableOres={availableOres}
        highlightUnbuildable={highlightUnbuildable}
        onToggleUnbuildable={setHighlightUnbuildable}
        showObelisk={showObelisk}
        onToggleObelisk={setShowObelisk}
      />

      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <TerritoryCanvas
          key={`${territory.size}-${selectedTile.tileSeed}`}
          territory={territory}
          viewMode={viewMode}
          devLayer={activeDevLayer}
          highlightUnbuildable={highlightUnbuildable}
          onHoverSubTile={setHoveredSubTile}
        />

        <TileInspector
          selectedTile={selectedTile}
          hoveredSubTile={hoveredSubTile}
          viewMode={viewMode}
        >
          <ContinentCanvas
            key={continent.size}
            continent={continent}
            viewMode={viewMode}
            devLayer={activeDevLayer}
            highlightUnbuildable={highlightUnbuildable}
            showObelisk={showObelisk}
            selectedCoords={activeCoords}
            onSelectTile={setSelectedCoords}
          />
        </TileInspector>
      </main>
    </div>
  );
}
