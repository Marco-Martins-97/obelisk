import { useEffect, useRef, useState } from 'react';
import {
  BUILDINGS,
  ORCHARD_TREES,
  calculateBuildingRepairCost,
  calculateRepairAllCost,
  canBuildOrUpgradeBuilding,
  canDemolishBuilding,
  groupBuildingRecipesByOutput,
} from '@obelisk/shared';
import CostInline from './CostInline.jsx';
import { formatRealHoursHMS } from '../utils/timeFormat.js';

/**
 * Reusable compact `[Label] [0] [-] count [+] [All]` stepper row used in both the
 * quick-dispatch rows (`Gather`, `Hunt`, `Collect Water`) and the nested `Team` mixer.
 *
 * @param {object} props
 * @param {string} props.label - Action or role label.
 * @param {string} [props.accentClass='text-slate-100'] - Color class for label.
 * @param {number} props.value - Current unit count.
 * @param {number} props.min - Minimum selectable count.
 * @param {number} props.max - Maximum selectable count.
 * @param {(next: number) => void} props.onChange
 * @param {() => void} [props.onExecute] - Optional primary click handler (quick-dispatch rows).
 * @param {boolean} [props.executeDisabled=false]
 * @param {string} props.clearLabel - Accessible aria-label for clear/0 button.
 * @param {string} props.decLabel - Accessible aria-label for decrement button.
 * @param {string} props.incLabel - Accessible aria-label for increment button.
 * @param {string} props.allLabel - Accessible aria-label for all/max button.
 * @returns {import('react').JSX.Element}
 */
function UnitQuantityRow({
  label,
  accentClass = 'text-slate-100',
  value,
  min,
  max,
  onChange,
  onExecute,
  executeDisabled = false,
  clearLabel,
  decLabel,
  incLabel,
  allLabel,
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 rounded border border-slate-800 bg-slate-950/75 px-2 py-1">
      {onExecute ? (
        <button
          type="button"
          role="menuitem"
          disabled={executeDisabled}
          onClick={onExecute}
          className={`flex-1 truncate text-left font-semibold transition ${
            executeDisabled
              ? 'cursor-not-allowed text-slate-500'
              : `${accentClass} hover:underline`
          }`}
        >
          {label}
        </button>
      ) : (
        <span className={`truncate font-medium ${accentClass}`}>{label}</span>
      )}

      <div className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
        <button
          type="button"
          aria-label={clearLabel}
          disabled={value <= min}
          onClick={() => onChange(min)}
          className="rounded border border-slate-700 px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          aria-label={decLabel}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          -
        </button>
        <span className="w-5 text-center text-slate-100">{value}</span>
        <button
          type="button"
          aria-label={incLabel}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          aria-label={allLabel}
          disabled={value >= max}
          onClick={() => onChange(max)}
          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          All
        </button>
      </div>
    </div>
  );
}

/**
 * Right-click tile command menu styled as:
 * - `[Gather] [0 - 1 + All]` (1-click solo squad dispatch)
 * - `[Hunt]   [0 - 1 + All]` (1-click solo squad dispatch)
 * - `[Collect Water] [0 - 1 + All]` (on water tiles)
 * - `[Team >]` submenu mixing `[Gather]`, `[Hunt]`, and `[Water]` roles
 * - `[Build >]` color-coded building menu (`ready`, `grey`, `red`)
 *
 * @param {object} props
 * @param {{ x: number, y: number, tile: object, clientX: number, clientY: number }} props.menuState
 * @param {Array<{ building: object, status: 'ready' | 'grey' | 'red', reason: string | null }>} props.buildingOptions
 * @param {{ gatherer: number, hunter: number, builder: number }} props.freeUnits
 * @param {boolean} props.isExplored
 * @param {boolean} [props.isAbandoned=false]
 * @param {object | null} [props.prospectionReport=null]
 * @param {() => void} props.onClose
 * @param {(action: string, units: object) => void} props.onDispatchAction
 * @param {(buildingId: string) => void} props.onBuildBuilding
 * @param {() => void} [props.onProspect]
 * @returns {import('react').JSX.Element}
 */
export default function TileActionMenu({
  menuState,
  buildingOptions,
  buildingOnTile = null,
  villageState = null,
  speedFactor = null,
  inventory = {},
  freeUnits,
  isExplored,
  isAbandoned = false,
  prospectionReport = null,
  onClose,
  onDispatchAction,
  onBuildBuilding,
  onProspect,
  onOpenBuilding,
  onRepairBuilding,
  onRepairAllBuildings,
  onUpgradeBuilding,
  onDemolishBuilding,
  onQuickCraft,
  onQuickHarvest,
}) {
  const activeSpeed = speedFactor ?? villageState?.speedFactor ?? 6;
  const effPenalty = villageState?.efficiencyPenalty ?? 0;
  const menuRef = useRef(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [hoveredBuilding, setHoveredBuilding] = useState(null);
  const [showTileActions, setShowTileActions] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const [quickG, setQuickG] = useState(() => (freeUnits.gatherer > 0 ? 1 : 0));
  const [quickH, setQuickH] = useState(() => (freeUnits.hunter > 0 ? 1 : 0));
  const [quickW, setQuickW] = useState(() =>
    freeUnits.gatherer + freeUnits.hunter > 0 ? 1 : 0,
  );

  const [teamG, setTeamG] = useState(() => (freeUnits.gatherer > 0 ? 1 : 0));
  const [teamH, setTeamH] = useState(() => (freeUnits.hunter > 0 ? 1 : 0));
  const [teamW, setTeamW] = useState(0);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clampedLeft = Math.max(8, Math.min(vw - 336, menuState.clientX));
  const clampedTop = Math.max(8, Math.min(vh - 440, menuState.clientY));

  const isWaterTile = Boolean(menuState.tile?.isWater);
  const totalFreeWaterPool = freeUnits.gatherer + freeUnits.hunter;

  const safeQuickG = Math.max(0, Math.min(freeUnits.gatherer, quickG));
  const safeQuickH = Math.max(0, Math.min(freeUnits.hunter, quickH));
  const safeQuickW = Math.max(0, Math.min(totalFreeWaterPool, quickW));

  const safeTeamG = Math.max(0, Math.min(freeUnits.gatherer, teamG));
  const safeTeamH = Math.max(0, Math.min(freeUnits.hunter, teamH));
  const maxTeamWater = Math.max(0, totalFreeWaterPool - safeTeamG - safeTeamH);
  const safeTeamW = isWaterTile ? Math.max(0, Math.min(maxTeamWater, teamW)) : 0;
  const totalTeam = safeTeamG + safeTeamH + safeTeamW;
  const teamSpeed = safeTeamG > 0 || safeTeamW > 0 ? 5 : safeTeamH > 0 ? 6 : 0;

  const inspectedOption =
    hoveredBuilding ??
    buildingOptions.find((opt) => opt.status !== 'ready') ??
    buildingOptions[0] ??
    null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for tile (${menuState.x}, ${menuState.y})`}
      style={{ left: `${clampedLeft}px`, top: `${clampedTop}px` }}
      className="fixed z-50 w-80 rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs text-slate-100 shadow-2xl backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between border-b border-slate-800 px-1 pb-1.5 font-mono text-[11px] text-amber-300">
        <span>
          Tile ({menuState.x}, {menuState.y})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close action menu"
        >
          ✕
        </button>
      </div>

      {isAbandoned ? (
        <p className="px-1 py-2 text-red-300">
          Village Abandoned. Click Start New Village or Reset Village to continue.
        </p>
      ) : buildingOnTile && !showTileActions ? (
        (() => {
          const bDef = BUILDINGS[buildingOnTile.buildingId];
          const cond = Math.round(buildingOnTile.condition ?? 100);
          const repairCost = calculateBuildingRepairCost(buildingOnTile);
          const needsRepair = Object.keys(repairCost).length > 0;
          const canAffordRepair =
            needsRepair &&
            Object.entries(repairCost).every(([id, q]) => (inventory[id] ?? 0) >= q);

          const repairAllCost =
            buildingOnTile.buildingId === 'main' && villageState?.buildings
              ? calculateRepairAllCost(villageState.buildings)
              : {};
          const hasDamagedAll = Object.keys(repairAllCost).length > 0;
          const canAffordRepairAll =
            hasDamagedAll &&
            Object.entries(repairAllCost).every(([id, q]) => (inventory[id] ?? 0) >= q);

          const mainBld =
            villageState?.buildings?.find((b) => b.buildingId === 'main') ?? buildingOnTile;
          const nextLv = buildingOnTile.level + 1;
          const upgRule = bDef
            ? canBuildOrUpgradeBuilding({
                buildingId: buildingOnTile.buildingId,
                currentLevel: buildingOnTile.level,
                targetLevel: nextLv,
                buildingTier: buildingOnTile.tier,
                mainTier: mainBld?.tier ?? 1,
                unlockedTechs: villageState?.unlockedTechs ?? [],
              })
            : { allowed: false };
          const upgCost = bDef
            ? Object.fromEntries(
                Object.entries(bDef.cost ?? {}).map(([id, q]) => [
                  id,
                  q * (buildingOnTile.tier ?? bDef.tier) * nextLv,
                ]),
              )
            : {};
          const canQuickUpgrade =
            buildingOnTile.status === 'active' &&
            buildingOnTile.level < (bDef?.maxLevel ?? 3) &&
            upgRule.allowed &&
            (freeUnits.builder ?? 0) >= 1 &&
            Object.entries(upgCost).every(([id, q]) => (inventory[id] ?? 0) >= q);

          const craftableGroup =
            buildingOnTile.status === 'active' && bDef?.craftsRecipes?.length > 0
              ? groupBuildingRecipesByOutput({
                  recipeIds: bDef.craftsRecipes,
                  unlockedTechs: villageState?.unlockedTechs ?? [],
                  inventory,
                  water: villageState?.water ?? 0,
                }).find((g) => g.hasAnyCraftable)
              : null;

          const detail = villageState?.tileDetails?.[`${buildingOnTile.x},${buildingOnTile.y}`];
          const cropReady =
            buildingOnTile.buildingId === 'crop_field' && detail?.cropPlot?.status === 'ready';
          const orchardPlot = detail?.orchardPlot;
          const orchardTree = orchardPlot
            ? (ORCHARD_TREES[orchardPlot.treeId] ?? ORCHARD_TREES.apple_tree)
            : null;
          const orchardReady =
            buildingOnTile.buildingId === 'orchard' &&
            Boolean(orchardPlot) &&
            orchardPlot.survivingSlots > 0 &&
            orchardPlot.grownDays >= (orchardTree?.matureDays ?? 336);

          const demolishCheck =
            buildingOnTile.buildingId !== 'main'
              ? canDemolishBuilding({
                  building: buildingOnTile,
                  buildings: villageState?.buildings ?? [],
                  units: villageState?.units ?? {},
                  starvationPopLoss: villageState?.starvationPopLoss ?? 0,
                })
              : null;

          return (
            <div className="flex flex-col gap-1.5">
              <div className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5">
                <div className="font-semibold text-amber-200">{bDef?.name}</div>
                <div className="text-[11px] text-slate-400">
                  T{buildingOnTile.tier} L{buildingOnTile.level} · Condition {cond}%
                </div>
              </div>

              {onOpenBuilding && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenBuilding(buildingOnTile);
                    onClose();
                  }}
                  className="rounded bg-amber-500 px-2 py-1.5 text-left font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Open {bDef?.name}
                </button>
              )}

              {needsRepair && onRepairBuilding && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canAffordRepair}
                  onClick={() => {
                    onRepairBuilding(buildingOnTile.instanceId);
                    onClose();
                  }}
                  className={`rounded border px-2 py-1.5 text-left ${
                    canAffordRepair
                      ? 'border-amber-600/60 bg-slate-900 text-amber-200 hover:bg-slate-800'
                      : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-500'
                  }`}
                >
                  <div className="font-semibold">Repair ({cond}% → 100%)</div>
                  <div className="text-[10px]">
                    <CostInline cost={repairCost} inventory={inventory} />
                  </div>
                </button>
              )}

              {buildingOnTile.buildingId === 'main' && hasDamagedAll && onRepairAllBuildings && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canAffordRepairAll}
                  onClick={() => {
                    onRepairAllBuildings();
                    onClose();
                  }}
                  className={`rounded border px-2 py-1.5 text-left ${
                    canAffordRepairAll
                      ? 'border-sky-600/60 bg-slate-900 text-sky-200 hover:bg-slate-800'
                      : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-500'
                  }`}
                >
                  <div className="font-semibold">Repair All Buildings</div>
                  <div className="text-[10px]">
                    <CostInline cost={repairAllCost} inventory={inventory} />
                  </div>
                </button>
              )}

              {(cropReady || orchardReady) && onQuickHarvest && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onQuickHarvest({
                      x: buildingOnTile.x,
                      y: buildingOnTile.y,
                      isOrchard: orchardReady,
                    });
                    onClose();
                  }}
                  className="rounded border border-emerald-600/60 bg-emerald-950/60 px-2 py-1.5 text-left font-semibold text-emerald-200 hover:bg-emerald-900/70"
                >
                  Quick Harvest
                </button>
              )}

              {craftableGroup && onQuickCraft && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onQuickCraft({
                      buildingInstanceId: buildingOnTile.instanceId,
                      recipeId: craftableGroup.activeRecipe.id,
                    });
                    onClose();
                  }}
                  className="rounded border border-sky-700/60 bg-sky-950/50 px-2 py-1.5 text-left font-semibold text-sky-200 hover:bg-sky-900/60"
                >
                  Quick Craft 1× {craftableGroup.outputName}
                </button>
              )}

              {buildingOnTile.level < (bDef?.maxLevel ?? 3) && onUpgradeBuilding && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canQuickUpgrade}
                  onClick={() => {
                    onUpgradeBuilding(buildingOnTile.instanceId);
                    onClose();
                  }}
                  className={`rounded border px-2 py-1.5 text-left font-semibold ${
                    canQuickUpgrade
                      ? 'border-emerald-700/60 bg-slate-900 text-emerald-300 hover:bg-slate-800'
                      : 'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-500'
                  }`}
                >
                  <div>Upgrade to Lv {nextLv}</div>
                  <div className="text-[10px] font-normal text-slate-400">
                    <CostInline cost={upgCost} inventory={inventory} /> ·{' '}
                    {formatRealHoursHMS(bDef?.buildTimeHours ?? 0, activeSpeed, effPenalty)}
                  </div>
                </button>
              )}

              {buildingOnTile.buildingId !== 'main' && onDemolishBuilding && demolishCheck && (
                !confirmDestroy ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!demolishCheck.allowed}
                    onClick={() => setConfirmDestroy(true)}
                    className="rounded border border-rose-800/70 bg-rose-950/40 px-2 py-1.5 text-left font-semibold text-rose-300 hover:bg-rose-950/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div>Destroy Building</div>
                    {!demolishCheck.allowed && (
                      <div className="text-[10px] font-normal text-rose-400">
                        {demolishCheck.reason}
                      </div>
                    )}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onDemolishBuilding(buildingOnTile.instanceId);
                        onClose();
                      }}
                      className="flex-1 rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-500"
                    >
                      Confirm Destroy
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDestroy(false)}
                      className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                )
              )}

              <button
                type="button"
                onClick={() => setShowTileActions(true)}
                className="mt-1 border-t border-slate-800 pt-1.5 text-left text-[11px] text-slate-400 hover:text-slate-200"
              >
                Tile Actions (Gather / Hunt) ▸
              </button>
            </div>
          );
        })()
      ) : !isExplored ? (
        <p className="px-1 py-2 text-slate-400">
          Unexplored Fog tile. Send a team to an adjacent explored tile to reveal on return.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <UnitQuantityRow
            label="Gather"
            accentClass="text-sky-300"
            value={safeQuickG}
            min={0}
            max={freeUnits.gatherer}
            onChange={setQuickG}
            executeDisabled={safeQuickG < 1}
            onExecute={() => {
              onDispatchAction('gather', { gatherer: safeQuickG, hunter: 0 });
              onClose();
            }}
            clearLabel="Clear quick gather count"
            decLabel="Decrease quick gather count"
            incLabel="Increase quick gather count"
            allLabel="Select all gatherers"
          />

          <UnitQuantityRow
            label="Hunt"
            accentClass="text-red-400"
            value={safeQuickH}
            min={0}
            max={freeUnits.hunter}
            onChange={setQuickH}
            executeDisabled={safeQuickH < 1}
            onExecute={() => {
              onDispatchAction('hunt', { gatherer: 0, hunter: safeQuickH });
              onClose();
            }}
            clearLabel="Clear quick hunt count"
            decLabel="Decrease quick hunt count"
            incLabel="Increase quick hunt count"
            allLabel="Select all hunters"
          />

          {isWaterTile && (
            <UnitQuantityRow
              label="Collect Water"
              accentClass="text-cyan-300"
              value={safeQuickW}
              min={0}
              max={totalFreeWaterPool}
              onChange={setQuickW}
              executeDisabled={safeQuickW < 1}
              onExecute={() => {
                onDispatchAction('collect_water', { water: safeQuickW });
                onClose();
              }}
              clearLabel="Clear quick water count"
              decLabel="Decrease quick water count"
              incLabel="Increase quick water count"
              allLabel="Select all water collectors"
            />
          )}

          {/* [Team >] Smart Role Assignment submenu */}
          <button
            type="button"
            role="menuitem"
            aria-expanded={teamOpen}
            onClick={() => setTeamOpen((prev) => !prev)}
            className="flex items-center justify-between rounded bg-slate-800/80 px-2 py-1.5 font-semibold text-orange-300 hover:bg-slate-800"
          >
            <span>Team</span>
            <span aria-hidden="true">{teamOpen ? '▾' : '▸'}</span>
          </button>

          {teamOpen && (
            <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/90 p-2">
              <UnitQuantityRow
                label={`Gather (${freeUnits.gatherer})`}
                accentClass="text-sky-300"
                value={safeTeamG}
                min={0}
                max={freeUnits.gatherer}
                onChange={setTeamG}
                clearLabel="Clear team gatherers"
                decLabel="Decrease team gatherers"
                incLabel="Increase team gatherers"
                allLabel="Select all team gatherers"
              />
              <UnitQuantityRow
                label={`Hunt (${freeUnits.hunter})`}
                accentClass="text-red-400"
                value={safeTeamH}
                min={0}
                max={freeUnits.hunter}
                onChange={setTeamH}
                clearLabel="Clear team hunters"
                decLabel="Decrease team hunters"
                incLabel="Increase team hunters"
                allLabel="Select all team hunters"
              />
              {isWaterTile && (
                <UnitQuantityRow
                  label={`Water (${maxTeamWater})`}
                  accentClass="text-cyan-300"
                  value={safeTeamW}
                  min={0}
                  max={maxTeamWater}
                  onChange={setTeamW}
                  clearLabel="Clear team water haulers"
                  decLabel="Decrease team water haulers"
                  incLabel="Increase team water haulers"
                  allLabel="Select all team water haulers"
                />
              )}

              <button
                type="button"
                disabled={totalTeam < 1}
                onClick={() => {
                  onDispatchAction('team', {
                    gatherer: safeTeamG,
                    hunter: safeTeamH,
                    water: safeTeamW,
                  });
                  onClose();
                }}
                className={`w-full rounded px-2 py-1.5 font-semibold transition ${
                  totalTeam >= 1
                    ? 'bg-orange-500 text-slate-950 hover:bg-orange-400'
                    : 'cursor-not-allowed bg-slate-800 text-slate-500'
                }`}
              >
                Send Team ({totalTeam} unit{totalTeam === 1 ? '' : 's'}
                {teamSpeed > 0 ? ` · ${teamSpeed} km/h` : ''})
              </button>
            </div>
          )}

          {/* [Build >] */}
          <button
            type="button"
            role="menuitem"
            aria-expanded={buildOpen}
            onClick={() => setBuildOpen((prev) => !prev)}
            className="flex items-center justify-between rounded bg-slate-800/80 px-2 py-1.5 font-semibold text-amber-300 hover:bg-slate-800"
          >
            <span>Build</span>
            <span aria-hidden="true">{buildOpen ? '▾' : '▸'}</span>
          </button>

          {!isWaterTile && onProspect && (
            <button
              type="button"
              role="menuitem"
              disabled={(freeUnits.prospector ?? 0) < 1}
              onClick={() => {
                onProspect();
                onClose();
              }}
              className={`flex items-center justify-between rounded border px-2 py-1.5 font-semibold transition ${
                (freeUnits.prospector ?? 0) >= 1
                  ? 'border-cyan-700/60 bg-slate-900 text-cyan-300 hover:bg-slate-800'
                  : 'cursor-not-allowed border-slate-800 bg-slate-950/60 text-slate-500'
              }`}
            >
              <span>Prospect Tile</span>
              <span className="font-mono text-[10px]">
                {freeUnits.prospector ?? 0} free
              </span>
            </button>
          )}

          {prospectionReport && (
            <>
              <button
                type="button"
                role="menuitem"
                aria-expanded={reportOpen}
                onClick={() => setReportOpen((p) => !p)}
                className="flex items-center justify-between rounded border border-emerald-700/60 bg-emerald-950/40 px-2 py-1.5 font-semibold text-emerald-300 hover:bg-emerald-950/70"
              >
                <span>View Prospection Report</span>
                <span aria-hidden="true">{reportOpen ? '▾' : '▸'}</span>
              </button>
              {reportOpen && (
                <div className="space-y-1 rounded border border-emerald-800/60 bg-slate-950/90 p-2 font-mono text-[11px]">
                  <div className="text-slate-200">
                    Rock: <strong className="capitalize">{prospectionReport.rockType}</strong> · Forest:{' '}
                    {Math.round(prospectionReport.forestDensity * 100)}%
                  </div>
                  {prospectionReport.ores.map((o) => (
                    <div key={o.oreId} className="flex justify-between text-slate-300">
                      <span>{o.name}</span>
                      <span className="text-amber-300">
                        {o.sampleLabel}
                        {o.estimatedDeposit > 0 ? ` (~${o.estimatedDeposit.toLocaleString()})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {buildOpen && (
            <div className="space-y-1 rounded-md border border-slate-800 bg-slate-950/90 p-1.5">
              <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
              {buildingOptions.map((option) => {
                const { building, status } = option;
                const styleClass =
                  status === 'ready'
                    ? 'border-emerald-700/60 bg-slate-900 text-slate-100 hover:bg-slate-800'
                    : status === 'grey'
                      ? 'border-slate-700 bg-slate-900/50 text-slate-400 cursor-not-allowed'
                      : 'border-rose-800/80 bg-rose-950/60 text-rose-300 cursor-not-allowed';

                return (
                  <button
                    key={building.id}
                    type="button"
                    data-build-status={status}
                    aria-disabled={status !== 'ready'}
                    onMouseEnter={() => setHoveredBuilding(option)}
                    onFocus={() => setHoveredBuilding(option)}
                    onClick={() => {
                      if (status !== 'ready') return;
                      onBuildBuilding(building.id);
                      onClose();
                    }}
                    className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left transition ${styleClass}`}
                  >
                    <span className="font-medium">{building.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {formatRealHoursHMS(building.buildTimeHours, activeSpeed, effPenalty)}
                    </span>
                  </button>
                );
              })}
              </div>

              {inspectedOption && (
                <div className="mt-1 rounded border border-slate-800 bg-slate-900/90 p-2 text-[11px] leading-relaxed">
                  <div className="font-semibold text-slate-100">
                    {inspectedOption.building.name}
                  </div>
                  <div className="text-slate-300">
                    Cost: <CostInline cost={inspectedOption.building.cost} inventory={inventory} /> ·{' '}
                    {formatRealHoursHMS(inspectedOption.building.buildTimeHours, activeSpeed, effPenalty)}
                  </div>
                  {inspectedOption.reason &&
                    inspectedOption.reason !== 'Insufficient resources.' && (
                      <div className="text-rose-400">{inspectedOption.reason}</div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
