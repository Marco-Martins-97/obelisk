import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import {
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  ROCK_TYPES,
  buildProspectionReport,
  generateContinent,
  generateTerritory,
  getAmbientTemperatureCelsius,
  getWorldTileContext,
  pickStarterSpawnTile,
} from '@obelisk/shared';
import BuildingModal from './components/BuildingModal.jsx';
import ContinentCanvas from './components/ContinentCanvas.jsx';
import ContinentExpeditionModal from './components/ContinentExpeditionModal.jsx';
import MapControls from './components/MapControls.jsx';
import TerritoryCanvas from './components/TerritoryCanvas.jsx';
import TileActionMenu from './components/TileActionMenu.jsx';
import TileInspector from './components/TileInspector.jsx';
import TopNavbar from './components/TopNavbar.jsx';
import {
  StockpileModal,
  TechnologiesModal,
  VillageHeaderBar,
  VillageLogModal,
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

/** Loads previously abandoned Continent coordinates persisted under `key`. */
function loadAbandonedVillages(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Saves abandoned Continent coordinates cleanly under `key`. */
function saveAbandonedVillages(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Ignore quota or disabled storage cleanly.
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
  abandonedCoords = [],
  ownedTerritories = [],
  onSelectTerritory = null,
  marketStorageKey = null,
  onStartNewVillage = null,
  topControls = null,
}) {
  const isOnline = mode === 'online';
  const village = useStoneAgeVillage({
    storageKey,
    seed,
    spawnTile,
    continentSize: continent.size,
    territory,
    continent,
    fixedSpeedFactor: isOnline ? 6 : null,
    marketStorageKey,
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [tileMenu, setTileMenu] = useState(null);
  const [continentMenuTile, setContinentMenuTile] = useState(null);
  const [activeMapView, setActiveMapView] = useState('territory');
  const [activeHudModal, setActiveHudModal] = useState(null);

  const selectedBuilding =
    village.state.buildings.find((b) => b.instanceId === selectedBuildingId) ?? null;

  const menuTile = tileMenu
    ? territory.tiles[tileMenu.y * territory.size + tileMenu.x]
    : null;
  const buildingOnMenuTile = tileMenu
    ? (village.state.buildings.find((b) => b.x === tileMenu.x && b.y === tileMenu.y) ?? null)
    : null;
  const menuBuildingOptions = tileMenu
    ? village.evaluateBuildingOptions(tileMenu.x, tileMenu.y)
    : [];
  const menuIsExplored = tileMenu
    ? village.territoryFogMask[tileMenu.y * territory.size + tileMenu.x] === 1
    : false;
  const menuProspectionReport =
    tileMenu &&
    menuTile &&
    village.state.tileDetails?.[`${tileMenu.x},${tileMenu.y}`]?.prospected
      ? buildProspectionReport(menuTile, territory.rockType)
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky header stack: TopNavbar -> (optional MapControls) -> VillageHeaderBar */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur">
        <TopNavbar
          speedFactor={isOnline ? 6 : village.state.speedFactor}
          onSpeedChange={village.setSpeedFactor}
          showSpeedSelect={!isOnline}
          calendar={village.calendar}
          temperatureC={getAmbientTemperatureCelsius(selectedTile.temperature, village.calendar)}
          onResetVillage={() => {
            setSelectedBuildingId(null);
            setTileMenu(null);
            setActiveHudModal(null);
            village.resetVillage();
          }}
        />

        {typeof topControls === 'function' ? topControls(village) : topControls}

        <VillageHeaderBar
          village={village}
          spawnTile={spawnTile}
          ownedTerritories={ownedTerritories}
          onSelectTerritory={onSelectTerritory}
          onOpenBuilding={(b) => setSelectedBuildingId(b.instanceId)}
          onOpenModal={setActiveHudModal}
          onStartNewVillage={
            onStartNewVillage
              ? () => {
                  setSelectedBuildingId(null);
                  setTileMenu(null);
                  setActiveHudModal(null);
                  onStartNewVillage(spawnTile);
                }
              : null
          }
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
              wall={village.state.wall}
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
              key={`${mode}-continent-${continent.size}-${spawnTile.x}-${spawnTile.y}`}
              continent={continent}
              viewMode={isOnline ? 'gameplay' : viewMode}
              devLayer={devLayer}
              highlightUnbuildable={!isOnline && highlightUnbuildable}
              showObelisk={!isOnline && showObelisk}
              continentFog={village.continentFogMask}
              showFog={isOnline || showFog}
              coordsOnlyTooltip={isOnline}
              villageCoords={spawnTile}
              abandonedCoords={abandonedCoords}
              selectedCoords={{ x: selectedTile.x, y: selectedTile.y }}
              onSelectTile={onSelectContinentTile}
              onOpenTileMenu={(payload) => setContinentMenuTile(payload.tile)}
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

            <VillageSidebarPanels village={village} territory={territory} />
          </div>
        </div>
      </main>

      {tileMenu && (
        <TileActionMenu
          menuState={{ ...tileMenu, tile: menuTile }}
          buildingOptions={menuBuildingOptions}
          buildingOnTile={buildingOnMenuTile}
          villageState={village.state}
          speedFactor={village.effectiveSpeedFactor}
          inventory={village.state.inventory}
          freeUnits={village.freeUnits}
          isExplored={menuIsExplored}
          isAbandoned={Boolean(village.state.isAbandoned)}
          prospectionReport={menuProspectionReport}
          onClose={() => setTileMenu(null)}
          onDispatchAction={(action, units) =>
            village.dispatchTileAction({ action, x: tileMenu.x, y: tileMenu.y, units })
          }
          onBuildBuilding={(buildingId) =>
            village.startBuildBuilding({ buildingId, x: tileMenu.x, y: tileMenu.y })
          }
          onProspect={() => village.prospectTile({ x: tileMenu.x, y: tileMenu.y })}
          onOpenBuilding={(b) => setSelectedBuildingId(b.instanceId)}
          onRepairBuilding={village.repairBuilding}
          onRepairAllBuildings={village.repairAllBuildings}
          onUpgradeBuilding={village.startUpgradeBuilding}
          onDemolishBuilding={(instanceId) => {
            if (selectedBuildingId === instanceId) setSelectedBuildingId(null);
            village.demolishBuilding(instanceId);
          }}
          onQuickCraft={village.startCraftRecipe}
          onQuickHarvest={({ x, y, isOrchard }) =>
            isOrchard
              ? village.harvestOrchardAction({ x, y })
              : village.harvestCropPlotAction({ x, y })
          }
        />
      )}

      <BuildingModal
        building={selectedBuilding}
        state={village.state}
        village={village}
        territory={territory}
        maxPop={village.maxPop}
        popUsed={village.popUsed}
        freeUnits={village.freeUnits}
        onClose={() => setSelectedBuildingId(null)}
        onTrainUnit={village.trainUnit}
        onDismissUnit={village.dismissUnit}
        onUpgradeBuilding={village.startUpgradeBuilding}
        onUpgradeBuildingTier={village.startUpgradeBuildingTier}
        onChangeMainTier={village.changeMainTier}
        onStartCraft={village.startCraftRecipe}
        onStartResearch={village.startResearchTech}
        onRepairBuilding={village.repairBuilding}
        onRepairAllBuildings={village.repairAllBuildings}
        onCancelTask={village.cancelTask}
        onDemolishBuilding={(instanceId) => {
          setSelectedBuildingId(null);
          village.demolishBuilding(instanceId);
        }}
      />

      <ContinentExpeditionModal
        targetTile={continentMenuTile}
        spawnTile={spawnTile}
        village={village}
        onClose={() => setContinentMenuTile(null)}
      />

      <StockpileModal
        isOpen={activeHudModal === 'stockpile'}
        village={village}
        onClose={() => setActiveHudModal(null)}
      />

      <TechnologiesModal
        isOpen={activeHudModal === 'techs'}
        unlockedTechs={village.state.unlockedTechs}
        onClose={() => setActiveHudModal(null)}
      />

      <VillageLogModal
        isOpen={activeHudModal === 'logs'}
        logs={village.state.logs}
        onClose={() => setActiveHudModal(null)}
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
  const abandonedKey = `obelisk_abandoned_online_${seed}_v1`;
  const [abandonedVillages, setAbandonedVillages] = useState(() =>
    loadAbandonedVillages(abandonedKey),
  );
  const continent = useMemo(
    () => generateContinent(seed, { size: DEFAULT_CONTINENT_SIZE }),
    [seed],
  );
  const spawnSeed =
    abandonedVillages.length === 0 ? seed : `${seed}:relocate:${abandonedVillages.length}`;
  const spawnTile = useMemo(
    () => pickStarterSpawnTile(continent, spawnSeed, abandonedVillages),
    [continent, spawnSeed, abandonedVillages],
  );
  const territory = useMemo(() => {
    const context = getWorldTileContext(continent, spawnTile.x, spawnTile.y);
    return generateTerritory(spawnTile.tileSeed, context, { size: DEFAULT_TERRITORY_SIZE });
  }, [continent, spawnTile]);

  const handleStartNewVillage = (prevCoords) => {
    const nextAbandoned = abandonedVillages.some(
      (c) => c.x === prevCoords.x && c.y === prevCoords.y,
    )
      ? abandonedVillages
      : [...abandonedVillages, { x: prevCoords.x, y: prevCoords.y }];
    saveAbandonedVillages(abandonedKey, nextAbandoned);
    setAbandonedVillages(nextAbandoned);
  };

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
      abandonedCoords={abandonedVillages}
      onStartNewVillage={handleStartNewVillage}
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
  const sandboxAbandonedKey = `obelisk_abandoned_sandbox_${config.seed}_v1`;
  const sandboxColoniesKey = `obelisk_sandbox_colonies_${config.seed}_v1`;
  const [abandonedMap, setAbandonedMap] = useState({});
  const [coloniesMap, setColoniesMap] = useState({});
  const abandonedVillages = abandonedMap[sandboxAbandonedKey] ?? loadAbandonedVillages(sandboxAbandonedKey);
  const extraColonies = coloniesMap[sandboxColoniesKey] ?? loadAbandonedVillages(sandboxColoniesKey);

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
    () => pickStarterSpawnTile(continent, config.seed, abandonedVillages),
    [continent, config.seed, abandonedVillages],
  );
  const ownedTerritories = useMemo(() => {
    const base = [{ x: spawnTile.x, y: spawnTile.y }];
    for (const c of extraColonies) {
      if (!base.some((t) => t.x === c.x && t.y === c.y) && c.x < continent.size && c.y < continent.size) {
        base.push({ x: c.x, y: c.y });
      }
    }
    return base;
  }, [spawnTile.x, spawnTile.y, extraColonies, continent.size]);

  const handleSpawnColony = () => {
    const exclude = [...abandonedVillages, ...ownedTerritories];
    const nextColony = pickStarterSpawnTile(
      continent,
      `${config.seed}:colony:${ownedTerritories.length}`,
      exclude,
    );
    if (exclude.some((t) => t.x === nextColony.x && t.y === nextColony.y)) return;
    const nextExtras = [...extraColonies, { x: nextColony.x, y: nextColony.y }];
    saveAbandonedVillages(sandboxColoniesKey, nextExtras);
    setColoniesMap((prev) => ({ ...prev, [sandboxColoniesKey]: nextExtras }));
    setSelectedCoords({ x: nextColony.x, y: nextColony.y });
  };

  const handleStartNewVillage = (prevCoords) => {
    const nextAbandoned = abandonedVillages.some(
      (c) => c.x === prevCoords.x && c.y === prevCoords.y,
    )
      ? abandonedVillages
      : [...abandonedVillages, { x: prevCoords.x, y: prevCoords.y }];
    saveAbandonedVillages(sandboxAbandonedKey, nextAbandoned);
    setAbandonedMap((prev) => ({ ...prev, [sandboxAbandonedKey]: nextAbandoned }));
    const nextSpawn = pickStarterSpawnTile(
      continent,
      `${config.seed}:relocate:${nextAbandoned.length}`,
      [...nextAbandoned, ...ownedTerritories],
    );
    setSelectedCoords({ x: nextSpawn.x, y: nextSpawn.y });
  };

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

  const controls = (village) => (
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
      onUnlockTerritory={village.unlockAllTerritoryFog}
      onUnlockContinent={village.unlockAllContinentFog}
      onSpawnColony={handleSpawnColony}
      onJumpDays={village.jumpSimulationDays}
      onGrantResource={village.grantSandboxResource}
    />
  );

  return (
    <PlayableVillageWorkspace
      key="sandbox"
      mode="sandbox"
      storageKey={`obelisk_sandbox_village_v1_${config.seed}_${activeCoords.x}_${activeCoords.y}`}
      marketStorageKey={`obelisk_sandbox_market_${config.seed}_v1`}
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
      abandonedCoords={abandonedVillages}
      ownedTerritories={ownedTerritories}
      onSelectTerritory={setSelectedCoords}
      onStartNewVillage={handleStartNewVillage}
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
