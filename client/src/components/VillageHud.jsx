import { useEffect, useId, useRef, useState } from 'react';
import {
  AGES,
  BLUEPRINTS,
  BUILDINGS,
  RECIPES,
  RESOURCES,
  TECHNOLOGIES,
  UNITS,
  canCancelTask,
  getBuildingTierConfig,
  getTaskCancelInfo,
  getTaskPhase,
  getVillageDailyProductionSummary,
} from '@obelisk/shared';
import {
  formatRealConclusionTimeHMS,
  formatRealDurationHMS,
  getCapacityHighColorClass,
  getReserveLowColorClass,
  getUnitAvailabilityColorClass,
} from '../utils/timeFormat.js';

const PHASE_BADGE_STYLES = {
  queued: 'bg-slate-800 text-slate-300',
  going: 'bg-sky-500/20 text-sky-300',
  doing: 'bg-amber-500/20 text-amber-300',
  returning: 'bg-emerald-500/20 text-emerald-300',
  done: 'bg-slate-700 text-slate-300',
};

const TEAM_MARKER_STYLES = {
  gatherer: 'bg-sky-400',
  hunter: 'bg-red-500',
  mixed: 'bg-orange-400',
  builder: 'bg-amber-300',
};

const STAGE_BADGE_STYLES = {
  ok: 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300',
  caution: 'border-amber-600/60 bg-amber-950/60 text-amber-300',
  warning: 'border-orange-600/60 bg-orange-950/60 text-orange-300',
  danger: 'border-rose-600/70 bg-rose-950/70 text-rose-300',
  critical: 'border-red-600 bg-red-950/80 text-red-200',
  abandoned: 'border-red-500 bg-red-950 text-red-200 font-bold',
};

/**
 * Shared accessible native `<dialog>` shell supporting backdrop press dismissal in both modern
 * (`closedby="any"`) and JSDOM/legacy environments.
 */
function useNativeDialogSync(dialogRef, isOpen, onClose) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }

    if (!isOpen || 'closedBy' in HTMLDialogElement.prototype) return undefined;

    let pressedOutside = false;
    const isOutside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e) => {
      if (pressedOutside && isOutside(e)) onClose();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [dialogRef, isOpen, onClose]);
}

/**
 * Sticky village resource & Age status bar rendered right below the TopNavbar
 * (or below MapControls on the Sandbox page), including modal openers for
 * Stockpile, Unlocked Technologies, and Village Log.
 *
 * @param {object} props
 * @param {object} props.village
 * @param {{ x: number, y: number } | null} [props.spawnTile]
 * @param {(building: object) => void} props.onOpenBuilding
 * @param {(modalKey: 'stockpile' | 'techs' | 'logs') => void} [props.onOpenModal]
 * @returns {import('react').JSX.Element}
 */
export function VillageHeaderBar({
  village,
  spawnTile,
  ownedTerritories = [],
  onSelectTerritory = null,
  onOpenBuilding,
  onOpenModal,
  onStartNewVillage = null,
}) {
  const {
    state,
    mainBuilding,
    storageUsed,
    storageCapacity,
    storedFood,
    waterCapacity,
    maxPop,
    popUsed,
    starvationStage,
  } = village;

  const currentAgeName = AGES[(mainBuilding?.tier ?? 1) - 1] ?? 'stone';
  const stage = starvationStage ?? {
    id: 'healthy',
    label: 'Healthy',
    efficiencyPenalty: 0,
    severity: 'ok',
  };
  const penaltyPct = Math.round((stage.efficiencyPenalty ?? 0) * 100);
  const formattedFood = Number.isInteger(storedFood) ? storedFood : Number(storedFood ?? 0).toFixed(1);
  const stockpileTypesCount = Object.values(state.inventory ?? {}).filter((q) => q > 0).length;

  return (
    <section
      aria-label="Village status header"
      className="border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-xs"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-semibold capitalize text-amber-300">
            {currentAgeName} Age · Main Tier {mainBuilding?.tier ?? 1} Lv {mainBuilding?.level ?? 1}
          </span>
          {spawnTile && (
            ownedTerritories.length > 1 && onSelectTerritory ? (
              <select
                aria-label="Active Territory"
                value={`${spawnTile.x},${spawnTile.y}`}
                onChange={(e) => {
                  const [tx, ty] = e.target.value.split(',').map(Number);
                  onSelectTerritory({ x: tx, y: ty });
                }}
                className="rounded border border-violet-700/70 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-violet-200"
              >
                {ownedTerritories.map((t, idx) => (
                  <option key={`${t.x},${t.y}`} value={`${t.x},${t.y}`}>
                    {idx === 0 ? 'Capital' : `Colony ${idx}`} ({t.x}, {t.y})
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                World ({spawnTile.x}, {spawnTile.y})
              </span>
            )
          )}
          <span
            aria-label="Village survival status"
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
              STAGE_BADGE_STYLES[stage.severity] ?? STAGE_BADGE_STYLES.ok
            }`}
          >
            {stage.label}
            {penaltyPct > 0 ? ` (-${penaltyPct}% eff)` : ''}
          </span>
          {(village.wallBonuses?.defensePercent ?? 0) > 0 && (
            <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-cyan-300">
              Wall {village.wallBonuses.defensePercent}% Defense
            </span>
          )}
          <button
            type="button"
            onClick={() => mainBuilding && onOpenBuilding(mainBuilding)}
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            Open Main Hall
          </button>
          {onOpenModal && (
            <>
              <button
                type="button"
                onClick={() => onOpenModal('stockpile')}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-amber-200 hover:bg-slate-800"
              >
                Stockpile ({stockpileTypesCount})
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('techs')}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-sky-200 hover:bg-slate-800"
              >
                Technologies ({state.unlockedTechs.length})
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('logs')}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-slate-200 hover:bg-slate-800"
              >
                Village Log ({state.logs.length})
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="text-slate-200">
            Storage:{' '}
            <strong className={getCapacityHighColorClass(storageUsed, storageCapacity, 'text-amber-300')}>
              {storageUsed}/{storageCapacity}
            </strong>
          </span>
          <span className="text-slate-200">
            Food:{' '}
            <strong className={getReserveLowColorClass(storedFood, popUsed, 'text-emerald-300')}>
              {formattedFood}
            </strong>
          </span>
          <span className="text-slate-200">
            Water:{' '}
            <strong className={getReserveLowColorClass(state.water, popUsed, 'text-sky-300')}>
              {state.water}/{waterCapacity}
            </strong>
          </span>
          <span className="text-slate-200">
            Pop:{' '}
            <strong className={getCapacityHighColorClass(popUsed, maxPop, 'text-purple-300')}>
              {popUsed}/{maxPop}
            </strong>
          </span>
        </div>
      </div>

      {state.isAbandoned && (
        <div
          role="alert"
          className="mx-auto mt-2 flex max-w-7xl flex-wrap items-center justify-between gap-2 rounded border border-red-700/80 bg-red-950/75 px-3 py-1.5 text-[11px] text-red-200"
        >
          <span>
            <strong>Abandoned Village:</strong> Settlement collapsed after prolonged deprivation or
            structural decay.
          </span>
          {onStartNewVillage && (
            <button
              type="button"
              onClick={onStartNewVillage}
              className="rounded bg-amber-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-amber-400"
            >
              Start New Village
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Right-sidebar stack ordered cleanly as:
 * 1) Production (`/day`)
 * 2) Units (`Free / Total`)
 * 3) Active Timers (scrollable fixed-height Going / Working / Returning timers)
 *
 * @param {object} props
 * @param {object} props.village
 * @param {object | null} [props.territory]
 * @returns {import('react').JSX.Element}
 */
export function VillageSidebarPanels({ village, territory = null }) {
  const { state, freeUnits, effectiveSpeedFactor } = village;
  const activeSpeed = effectiveSpeedFactor ?? state.speedFactor ?? 6;

  const dailyProduction = getVillageDailyProductionSummary({
    buildings: state.buildings,
    territory,
    tileDetails: state.tileDetails,
    unlockedTechs: state.unlockedTechs,
    efficiencyPenalty: state.efficiencyPenalty ?? 0,
    animals: state.animals,
  });

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* 1. Production (/day) */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Production (/day)
        </h3>
        <div className="max-h-40 overflow-y-auto pr-1">
          {dailyProduction.length === 0 ? (
            <p className="text-[11px] text-slate-500">No active production.</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px]">
              {dailyProduction.map((entry) => (
                <li
                  key={entry.resourceId}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-200">{entry.name}</div>
                    <div className="truncate text-[10px] text-slate-400">
                      {entry.sources.join(', ')}
                      {entry.remaining !== null
                        ? ` · ${entry.remaining.toLocaleString()} left`
                        : ''}
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-emerald-300">
                    +{entry.ratePerDay}/d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 2. Units */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Units (Free / Total)
        </h3>
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          {Object.keys(UNITS)
            .filter(
              (unitId) =>
                (UNITS[unitId]?.tier ?? 1) <= (village.mainBuilding?.tier ?? 1) ||
                (state.units[unitId] ?? 0) > 0,
            )
            .map((unitId) => {
            const totalCount = state.units[unitId] ?? 0;
            const freeCount = freeUnits[unitId] ?? 0;
            const availabilityColorClass = getUnitAvailabilityColorClass(freeCount, totalCount);
            return (
              <div
                key={unitId}
                className="flex flex-col items-center justify-between rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-center"
              >
                <div className="text-[10px] text-white">{UNITS[unitId].name}</div>
                <div className="flex items-center justify-center gap-1.5 font-bold">
                  <span className={availabilityColorClass}>
                    {freeCount}/{totalCount}
                  </span>
                  {totalCount > 0 && village.dismissUnit && (
                    <button
                      type="button"
                      aria-label={`Dispense 1 ${UNITS[unitId].name}`}
                      disabled={Boolean(state.isAbandoned) || freeCount < 1}
                      onClick={() => village.dismissUnit(unitId)}
                      className="rounded border border-rose-700/70 bg-rose-950/60 px-1 py-0 text-[9px] font-semibold text-rose-200 hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      -1
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Active Timers (fixed scrollable viewport) */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Active Timers ({state.tasks.length})
        </h3>
        <div className="h-44 overflow-y-auto pr-1">
          {state.tasks.length === 0 ? (
            <p className="text-[11px] text-slate-500">No active timers.</p>
          ) : (
            <ul className="space-y-1.5 font-mono text-[11px]">
              {state.tasks.map((t) => {
                const phaseInfo = getTaskPhase(t, state.virtualTimeMs);
                const markerKey =
                  t.kind === 'unit_action' || t.kind === 'expedition'
                    ? (t.teamType ?? 'gatherer')
                    : t.kind === 'prospect'
                      ? 'gatherer'
                      : t.kind === 'build' ||
                          t.kind === 'upgrade' ||
                          t.kind === 'upgrade_main' ||
                          t.kind === 'upgrade_tier' ||
                          t.kind === 'upgrade_wall'
                        ? 'builder'
                        : null;

                const teamTag =
                  t.kind === 'unit_action'
                    ? [
                        t.units?.gatherer ? `${t.units.gatherer}G` : '',
                        t.units?.hunter ? `${t.units.hunter}H` : '',
                      ]
                        .filter(Boolean)
                        .join('+') || UNITS[t.unitId]?.name
                    : '';

                const trainerBuilding =
                  t.kind === 'train_unit' && t.buildingInstanceId
                    ? state.buildings.find((b) => b.instanceId === t.buildingInstanceId)
                    : null;
                const coordsLabel =
                  typeof t.x === 'number' && typeof t.y === 'number'
                    ? `(${t.x}, ${t.y})`
                    : typeof t.toX === 'number' && typeof t.toY === 'number'
                      ? `(${t.toX}, ${t.toY})`
                      : trainerBuilding
                        ? BUILDINGS[trainerBuilding.buildingId]?.name ?? 'Main Hall'
                        : 'Main Hall';

                const unitBatch = t.kind === 'train_unit' && (t.quantity ?? 1) > 1 ? `${t.quantity}x ` : '';
                const craftBatch = t.quantity > 1 ? `${t.quantity}x ` : '';
                const rightLabel =
                  t.kind === 'unit_action'
                    ? `Team (${teamTag})`
                    : t.kind === 'expedition'
                      ? 'Continent Expedition'
                      : t.kind === 'prospect'
                        ? 'Prospect Survey'
                        : t.kind === 'build'
                          ? `Build ${getBuildingTierConfig(t.buildingId, t.targetTier ?? 1).name}`
                          : t.kind === 'upgrade_main'
                            ? `Main -> Tier ${t.targetTier}`
                            : t.kind === 'upgrade_tier'
                              ? `${getBuildingTierConfig(t.buildingId, t.targetTier ?? 1).name} -> T${t.targetTier}`
                              : t.kind === 'upgrade_wall'
                                ? `Wall -> T${t.targetTier} L${t.targetLevel}`
                                : t.kind === 'upgrade'
                                  ? `Upgrade ${BUILDINGS[t.buildingId].name}`
                                  : t.kind === 'train_unit'
                                    ? `${unitBatch}Recruit ${UNITS[t.unitId]?.name ?? t.unitId}`
                                    : t.kind === 'research'
                                      ? `Research ${TECHNOLOGIES[t.techId].name}`
                                      : `Craft ${craftBatch}${RECIPES[t.recipeId].name}`;

                const cancelInfo =
                  !state.isAbandoned && village.cancelTask
                    ? getTaskCancelInfo(t, state.virtualTimeMs)
                    : { allowed: false, cancelMode: null };
                const canCancel = Boolean(cancelInfo.allowed && canCancelTask(t, state.virtualTimeMs).allowed);
                const cancelText =
                  cancelInfo.cancelMode === 'waiting_only'
                    ? `Cancel (${(t.quantity ?? 1) - 1})`
                    : 'Cancel';

                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-1 rounded border border-slate-800 bg-slate-950/70 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-slate-200">
                      <span className="shrink-0 font-semibold text-amber-300">{coordsLabel}</span>
                      <span className="flex items-center gap-1.5 truncate font-semibold">
                        {markerKey && (
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                              TEAM_MARKER_STYLES[markerKey] ?? 'bg-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{rightLabel}</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-400">
                        Conclusion:{' '}
                        {formatRealConclusionTimeHMS(phaseInfo.totalRemainingMs, activeSpeed)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => village.cancelTask(t.id)}
                            className="rounded border border-rose-700/70 bg-rose-950/70 px-1.5 py-0.5 font-semibold text-rose-200 hover:bg-rose-900/80"
                          >
                            {cancelText}
                          </button>
                        )}
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                            PHASE_BADGE_STYLES[phaseInfo.phase]
                          }`}
                        >
                          {phaseInfo.phaseLabel}{' '}
                          {formatRealDurationHMS(phaseInfo.phaseRemainingMs, activeSpeed)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Generates a short 2-3 character emblem tag for an item's placeholder icon tile inside Stockpile.
 */
function getItemMonogram(name, id) {
  const words = String(name ?? id ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return String(name ?? id ?? '?')
    .slice(0, 2)
    .toUpperCase();
}

const STOCKPILE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'material', label: 'Materials' },
  { id: 'food', label: 'Food' },
  { id: 'ore', label: 'Ores' },
  { id: 'ingot', label: 'Ingots' },
];

/**
 * Stockpile Modal rendering category tabs and left-clickable resource item cards (`[img, name, qty]`).
 * Left-clicking an item card opens its item action bar (`Remove` with quantity + `Max`).
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.village
 * @param {() => void} props.onClose
 * @returns {import('react').JSX.Element}
 */
export function StockpileModal({ isOpen, village, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [activeCategory, setActiveCategory] = useState('all');
  const [contextItemId, setContextItemId] = useState(null);
  const [discardAmount, setDiscardAmount] = useState(1);

  const handleClose = () => {
    setActiveCategory('all');
    setContextItemId(null);
    onClose();
  };

  useNativeDialogSync(dialogRef, isOpen, handleClose);

  const { state, removeResource, storageUsed, storageCapacity } = village;
  const inventoryItems = Object.entries(state.inventory ?? {}).filter(([, qty]) => qty > 0);
  const filteredItems = inventoryItems.filter(([id]) => {
    if (activeCategory === 'all') return true;
    const cat = RESOURCES[id]?.category ?? 'material';
    if (activeCategory === 'ore') return cat === 'ore' || cat === 'ore_nugget';
    return cat === activeCategory;
  });
  const activeItemQty = contextItemId ? (state.inventory?.[contextItemId] ?? 0) : 0;
  const activeRes = contextItemId ? RESOURCES[contextItemId] : null;
  const clampedDiscard = Math.max(1, Math.min(Math.max(1, activeItemQty), discardAmount));

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={handleClose}
      className="m-auto w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      {isOpen && (
        <>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 id={titleId} className="text-base font-bold text-amber-300">
              Stockpile ({storageUsed}/{storageCapacity})
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Close
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Stockpile categories"
            className="mt-3 flex flex-wrap gap-1.5 border-b border-slate-800 pb-2.5 text-xs"
          >
            {STOCKPILE_TABS.map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setActiveCategory(tab.id);
                    setContextItemId(null);
                  }}
                  className={`rounded-md border px-2.5 py-1 font-medium transition ${
                    active
                      ? 'border-amber-500/70 bg-amber-500/20 text-amber-200'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 max-h-96 overflow-y-auto pr-1">
            {inventoryItems.length === 0 ? (
              <p className="text-xs text-slate-500">Storage empty.</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-xs text-slate-500">No items in this category.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {filteredItems.map(([id, qty]) => {
                  const res = RESOURCES[id];
                  const isSelected = contextItemId === id;

                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`${res?.name ?? id} item card`}
                      onClick={() => {
                        setContextItemId((prev) => (prev === id ? null : id));
                        setDiscardAmount(1);
                      }}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
                        isSelected
                          ? 'border-amber-500 bg-slate-800/90'
                          : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Future item sprite slot */}
                      <div
                        data-item-icon={id}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-mono text-xs font-bold text-amber-300"
                      >
                        {getItemMonogram(res?.name, id)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-100">
                          {res?.name ?? id}
                        </div>
                        <div className="font-mono text-xs font-bold text-emerald-300">Qty: {qty}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {contextItemId && activeItemQty > 0 && (
            <div
              role="menu"
              aria-label={`Item actions for ${activeRes?.name ?? contextItemId}`}
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-600/50 bg-slate-950 p-3 text-xs"
            >
              <div className="font-semibold text-amber-200">
                {activeRes?.name ?? contextItemId} ({activeItemQty})
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <input
                  type="number"
                  min={1}
                  max={activeItemQty}
                  disabled={Boolean(state.isAbandoned)}
                  value={clampedDiscard}
                  aria-label={`Remove amount for ${activeRes?.name ?? contextItemId}`}
                  onChange={(e) => setDiscardAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-center text-slate-100 disabled:opacity-40"
                />
                <button
                  type="button"
                  disabled={Boolean(state.isAbandoned)}
                  onClick={() => setDiscardAmount(activeItemQty)}
                  className="rounded border border-amber-600/60 bg-amber-950/50 px-2 py-1 text-amber-200 hover:bg-amber-900/60 disabled:opacity-40"
                >
                  Max
                </button>
                <button
                  type="button"
                  disabled={Boolean(state.isAbandoned)}
                  aria-label={`Remove ${activeRes?.name ?? contextItemId}`}
                  onClick={() => {
                    removeResource(contextItemId, clampedDiscard);
                    setContextItemId(null);
                    setDiscardAmount(1);
                  }}
                  className="rounded border border-rose-700/70 bg-rose-950/70 px-2.5 py-1 font-sans font-semibold text-rose-200 hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setContextItemId(null)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-sans text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}

/**
 * Unlocked Technologies Modal presenting all discovered/researched techs.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string[]} props.unlockedTechs
 * @param {() => void} props.onClose
 * @returns {import('react').JSX.Element}
 */
export function TechnologiesModal({ isOpen, unlockedTechs, unlockedBlueprints = [], onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useNativeDialogSync(dialogRef, isOpen, onClose);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      {isOpen && (
        <>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 id={titleId} className="text-base font-bold text-sky-300">
              Unlocked Technologies ({unlockedTechs.length})
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1 text-xs">
            {unlockedBlueprints.length > 0 && (
              <div className="space-y-1.5 border-b border-slate-800 pb-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                  Discovered Ruin Blueprints ({unlockedBlueprints.length}/3)
                </div>
                {unlockedBlueprints.map((bpId) => {
                  const bp = BLUEPRINTS[bpId];
                  return (
                    <div
                      key={bpId}
                      className="rounded-lg border border-purple-500/40 bg-purple-950/30 p-2.5"
                    >
                      <div className="font-semibold text-purple-200">{bp?.name ?? bpId}</div>
                      {bp?.description && (
                        <p className="mt-0.5 text-[11px] text-slate-300">{bp.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {unlockedTechs.length === 0 ? (
              <p className="text-slate-500">No technologies unlocked yet.</p>
            ) : (
              unlockedTechs.map((techId) => {
                const tech = TECHNOLOGIES[techId];
                return (
                  <div
                    key={techId}
                    className="rounded-lg border border-amber-500/30 bg-slate-950/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-200">
                        {tech?.name ?? techId}
                      </span>
                      {tech?.age && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] capitalize text-slate-300">
                          {tech.age} Age
                        </span>
                      )}
                    </div>
                    {tech?.description && (
                      <p className="mt-1 text-[11px] text-slate-400">{tech.description}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </dialog>
  );
}

/**
 * Village Activity Log Modal displaying recent settlement events and expedition logs.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string[]} props.logs
 * @param {() => void} props.onClose
 * @returns {import('react').JSX.Element}
 */
export function VillageLogModal({ isOpen, logs, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useNativeDialogSync(dialogRef, isOpen, onClose);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      {isOpen && (
        <>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 id={titleId} className="text-base font-bold text-slate-200">
              Village Log ({logs.length})
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Close
            </button>
          </div>

          <ul
            aria-label="Village activity log"
            className="mt-4 max-h-80 space-y-1.5 overflow-y-auto pr-1 font-mono text-[11px] text-slate-300"
          >
            {logs.length === 0 ? (
              <li className="text-slate-500">No village events recorded yet.</li>
            ) : (
              logs.map((entry, idx) => (
                <li
                  key={`${idx}-${entry.slice(0, 14)}`}
                  className="rounded border border-slate-800 bg-slate-950/70 px-2.5 py-1.5"
                >
                  {entry}
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </dialog>
  );
}
