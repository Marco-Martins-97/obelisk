import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import {
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  ROCK_TYPES,
  generateContinent,
  generateTerritory,
  getAmbientTemperatureCelsius,
  getWorldTileContext,
  pickStarterSpawnTile,
} from '@obelisk/shared';
import BuildingModal from './components/BuildingModal.jsx';
import ContinentCanvas from './components/ContinentCanvas.jsx';
import MapControls from './components/MapControls.jsx';
import TerritoryCanvas from './components/TerritoryCanvas.jsx';
import TileActionMenu from './components/TileActionMenu.jsx';
import TileInspector from './components/TileInspector.jsx';
import TopNavbar from './components/TopNavbar.jsx';
import {
  VillageHeaderBar,
  VillageLogFooter,
  VillageSidebarPanels,
} from './components/VillageHud.jsx';
import { useStoneAgeVillage } from './hooks/useStoneAgeVillage.js';

const DEFAULT_SANDBOX_CONFIG = {
  seed: 'obelisk-alpha',
  continentSize: DEFAULT_CONTINENT_SIZE,
  territorySize: DEFAULT_TERRITORY_SIZE,
  viewMode: 'gameplay',
  devLayer: 'biome',
  highlightUnbuildable: false,
  showObelisk: true,
  showFog: true,
};

const SANDBOX_CONFIG_STORAGE_KEY = 'obelisk_sandbox_config_v1';

/**
 * Loads saved Sandbox generator/layer preferences from `localStorage`.
 *
 * @returns {object} Sandbox configuration defaults merged with saved entries.
 */
function loadSandboxConfig() {
  try {
    const raw = window.localStorage.getItem(SANDBOX_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_SANDBOX_CONFIG;
    return { ...DEFAULT_SANDBOX_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SANDBOX_CONFIG;
  }
}

/**
 * Shared playable Stone Age workspace parameterized for either Online (`/`) or Sandbox (`/sandbox`).
 * Online hides all dev telemetry and tile info (`coordsOnlyTooltip`), whereas Sandbox mounts
 * terrain heatmaps, inspector metadata, and optional Fog of War controls.
 *
 * @param {object} props
 * @param {'online' | 'sandbox'} props.mode
 * @param {string} props.storageKey
 * @param {string} props.seed
 * @param {object} props.continent
 * @param {object} props.spawnTile
 * @param {object} props.selectedTile
 * @param {object} props.territory
 * @param {number} props.territorySize
 * @param {'gameplay' | 'dev'} props.viewMode
 * @param {string} props.devLayer
 * @param {boolean} props.highlightUnbuildable
 * @param {boolean} props.showObelisk
 * @param {boolean} props.showFog
 * @param {object | null} props.hoveredSubTile
 * @param {(tile: object | null) => void} props.onHoverSubTile
 * @param {(coords: { x: number, y: number }) => void} [props.onSelectContinentTile]
 * @param {import('react').ReactNode} [props.topControls]
 * @returns {import('react').JSX.Element}
 */
function PlayableVillageWorkspace({
  mode,
  storageKey,
  seed,
  continent,
  spawnTile,
  selectedTile,
  territory,
  viewMode,
  devLayer,
  highlightUnbuildable,
  showObelisk,
  showFog,
  hoveredSubTile,
  onHoverSubTile,
  onSelectContinentTile,
  topControls = null,
}) {
  const isOnline = mode === 'online';
  const village = useStoneAgeVillage({
    storageKey,
    seed,
    spawnTile,
    continentSize: continent.size,
    territory,
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [tileMenu, setTileMenu] = useState(null);
  const [activeMapView, setActiveMapView] = useState('territory');

  const selectedBuilding =
    village.state.buildings.find((b) => b.instanceId === selectedBuildingId) ?? null;

  const menuTile = tileMenu
    ? territory.tiles[tileMenu.y * territory.size + tileMenu.x]
    : null;
  const menuBuildingOptions = tileMenu
    ? village.evaluateBuildingOptions(tileMenu.x, tileMenu.y)
    : [];
  const menuIsExplored = tileMenu
    ? village.territoryFogMask[tileMenu.y * territory.size + tileMenu.x] === 1
    : false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky header stack: TopNavbar -> (optional MapControls) -> VillageHeaderBar */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur">
        <TopNavbar
          speedFactor={village.state.speedFactor}
          onSpeedChange={village.setSpeedFactor}
          calendar={village.calendar}
          temperatureC={getAmbientTemperatureCelsius(selectedTile.temperature, village.calendar)}
          onResetVillage={() => {
            setSelectedBuildingId(null);
            setTileMenu(null);
            village.resetVillage();
          }}
        />

        {topControls}

        <VillageHeaderBar
          village={village}
          spawnTile={spawnTile}
          onOpenBuilding={(b) => setSelectedBuildingId(b.instanceId)}
        />
      </div>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
          {activeMapView === 'territory' ? (
            <TerritoryCanvas
              key={`${mode}-${territory.size}-${selectedTile.tileSeed}`}
              territory={territory}
              viewMode={isOnline ? 'gameplay' : viewMode}
              devLayer={devLayer}
              highlightUnbuildable={!isOnline && highlightUnbuildable}
              territoryFog={village.territoryFogMask}
              showFog={isOnline || showFog}
              coordsOnlyTooltip={isOnline}
              buildings={village.state.buildings}
              activeTasks={village.state.tasks.filter((t) => typeof t.x === 'number')}
              selectedTileCoords={tileMenu ? { x: tileMenu.x, y: tileMenu.y } : null}
              onHoverSubTile={onHoverSubTile}
              onSelectBuilding={(b) => setSelectedBuildingId(b.instanceId)}
              onOpenTileMenu={(payload) => setTileMenu(payload)}
              onSwitchToContinent={() => {
                setTileMenu(null);
                setActiveMapView('continent');
              }}
            />
          ) : (
            <ContinentCanvas
              key={`${mode}-continent-${continent.size}`}
              continent={continent}
              viewMode={isOnline ? 'gameplay' : viewMode}
              devLayer={devLayer}
              highlightUnbuildable={!isOnline && highlightUnbuildable}
              showObelisk={!isOnline && showObelisk}
              continentFog={village.continentFogMask}
              showFog={isOnline || showFog}
              coordsOnlyTooltip={isOnline}
              villageCoords={spawnTile}
              selectedCoords={{ x: selectedTile.x, y: selectedTile.y }}
              onSelectTile={onSelectContinentTile}
              onSwitchToTerritory={() => setActiveMapView('territory')}
            />
          )}

          <div className="flex flex-col gap-3">
            {!isOnline && (
              <TileInspector
                selectedTile={selectedTile}
                hoveredSubTile={hoveredSubTile}
                viewMode={viewMode}
              />
            )}

            <VillageSidebarPanels village={village} />
          </div>
        </div>

        <VillageLogFooter logs={village.state.logs} />
      </main>

      {tileMenu && (
        <TileActionMenu
          menuState={{ ...tileMenu, tile: menuTile }}
          buildingOptions={menuBuildingOptions}
          freeUnits={village.freeUnits}
          isExplored={menuIsExplored}
          isAbandoned={Boolean(village.state.isAbandoned)}
          onClose={() => setTileMenu(null)}
          onDispatchAction={(action, units) =>
            village.dispatchTileAction({ action, x: tileMenu.x, y: tileMenu.y, units })
          }
          onBuildBuilding={(buildingId) =>
            village.startBuildBuilding({ buildingId, x: tileMenu.x, y: tileMenu.y })
          }
        />
      )}

      <BuildingModal
        building={selectedBuilding}
        state={village.state}
        maxPop={village.maxPop}
        popUsed={village.popUsed}
        freeUnits={village.freeUnits}
        onClose={() => setSelectedBuildingId(null)}
        onTrainUnit={village.trainUnit}
        onUpgradeBuilding={village.startUpgradeBuilding}
        onChangeMainTier={village.changeMainTier}
        onStartCraft={village.startCraftRecipe}
        onStartResearch={village.startResearchTech}
      />
    </div>
  );
}

/**
 * Online Play Page (`/`): clean Stone Age gameplay viewport with Territory + Continent Fog of War,
 * coordinate-only tooltips, left-click Building Menu, right-click Action/Build Menu, and speed control.
 *
 * @returns {import('react').JSX.Element}
 */
function OnlinePage() {
  const seed = 'obelisk-alpha';
  const continent = useMemo(
    () => generateContinent(seed, { size: DEFAULT_CONTINENT_SIZE }),
    [seed],
  );
  const spawnTile = useMemo(() => pickStarterSpawnTile(continent, seed), [continent, seed]);
  const territory = useMemo(() => {
    const context = getWorldTileContext(continent, spawnTile.x, spawnTile.y);
    return generateTerritory(spawnTile.tileSeed, context, { size: DEFAULT_TERRITORY_SIZE });
  }, [continent, spawnTile]);

  return (
    <PlayableVillageWorkspace
      key={`online-${seed}-${spawnTile.x}-${spawnTile.y}`}
      mode="online"
      storageKey="obelisk_online_village_v1"
      seed={seed}
      continent={continent}
      spawnTile={spawnTile}
      selectedTile={spawnTile}
      territory={territory}
      territorySize={DEFAULT_TERRITORY_SIZE}
      viewMode="gameplay"
      devLayer="biome"
      highlightUnbuildable={false}
      showObelisk={false}
      showFog
      hoveredSubTile={null}
      onHoverSubTile={() => {}}
    />
  );
}

/**
 * Sandbox Page (`/sandbox`): localhost-persisted world & territory visualizer + playable sandbox
 * with Stage 2 Dev overlays, Fog toggle, and speed multiplier.
 *
 * @returns {import('react').JSX.Element}
 */
function SandboxPage() {
  const [config, setConfig] = useState(loadSandboxConfig);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [hoveredSubTile, setHoveredSubTile] = useState(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SANDBOX_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore disabled storage cleanly.
    }
  }, [config]);

  const continent = useMemo(
    () => generateContinent(config.seed, { size: config.continentSize }),
    [config.seed, config.continentSize],
  );
  const spawnTile = useMemo(
    () => pickStarterSpawnTile(continent, config.seed),
    [continent, config.seed],
  );

  const activeCoords =
    selectedCoords &&
    selectedCoords.x < continent.size &&
    selectedCoords.y < continent.size
      ? selectedCoords
      : spawnTile;

  const selectedTile = continent.tiles[activeCoords.y * continent.size + activeCoords.x];
  const rockInfo = ROCK_TYPES.find((r) => r.id === selectedTile.rockType) ?? ROCK_TYPES[0];
  const availableOres = rockInfo.ores;

  const activeDevLayer =
    config.devLayer.startsWith('ore:') && !availableOres.includes(config.devLayer.slice(4))
      ? `ore:${availableOres[0]}`
      : config.devLayer;

  const territory = useMemo(() => {
    const context = getWorldTileContext(continent, activeCoords.x, activeCoords.y);
    return generateTerritory(selectedTile.tileSeed, context, { size: config.territorySize });
  }, [continent, activeCoords.x, activeCoords.y, selectedTile.tileSeed, config.territorySize]);

  const handleRandomizeSeed = () => {
    const randomSuffix = Math.floor(Date.now() % 1000000).toString(36);
    setConfig((prev) => ({ ...prev, seed: `obelisk-${randomSuffix}` }));
    setSelectedCoords(null);
  };

  const controls = (
    <MapControls
      seed={config.seed}
      onApplySeed={(next) => {
        setConfig((prev) => ({ ...prev, seed: next }));
        setSelectedCoords(null);
      }}
      onRandomizeSeed={handleRandomizeSeed}
      continentSize={config.continentSize}
      onContinentSizeChange={(size) => {
        setConfig((prev) => ({ ...prev, continentSize: size }));
        setSelectedCoords(null);
      }}
      territorySize={config.territorySize}
      onTerritorySizeChange={(size) => setConfig((prev) => ({ ...prev, territorySize: size }))}
      viewMode={config.viewMode}
      onViewModeChange={(viewMode) => setConfig((prev) => ({ ...prev, viewMode }))}
      devLayer={activeDevLayer}
      onDevLayerChange={(devLayer) => setConfig((prev) => ({ ...prev, devLayer }))}
      availableOres={availableOres}
      highlightUnbuildable={config.highlightUnbuildable}
      onToggleUnbuildable={(val) =>
        setConfig((prev) => ({ ...prev, highlightUnbuildable: val }))
      }
      showObelisk={config.showObelisk}
      onToggleObelisk={(val) => setConfig((prev) => ({ ...prev, showObelisk: val }))}
      showFog={config.showFog}
      onToggleFog={(val) => setConfig((prev) => ({ ...prev, showFog: val }))}
    />
  );

  return (
    <PlayableVillageWorkspace
      key="sandbox"
      mode="sandbox"
      storageKey={`obelisk_sandbox_village_v1_${config.seed}_${activeCoords.x}_${activeCoords.y}`}
      seed={config.seed}
      continent={continent}
      spawnTile={activeCoords}
      selectedTile={selectedTile}
      territory={territory}
      territorySize={config.territorySize}
      viewMode={config.viewMode}
      devLayer={activeDevLayer}
      highlightUnbuildable={config.highlightUnbuildable}
      showObelisk={config.showObelisk}
      showFog={config.showFog}
      hoveredSubTile={hoveredSubTile}
      onHoverSubTile={setHoveredSubTile}
      onSelectContinentTile={setSelectedCoords}
      topControls={controls}
    />
  );
}

/**
 * Route outlet separating Online (`/`) and Sandbox (`/sandbox`) views cleanly for both runtime and tests.
 *
 * @returns {import('react').JSX.Element}
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OnlinePage />} />
      <Route path="/sandbox" element={<SandboxPage />} />
    </Routes>
  );
}

/**
 * Root application shell wrapped in BrowserRouter.
 *
 * @returns {import('react').JSX.Element}
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
