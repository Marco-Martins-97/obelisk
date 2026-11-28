import { useEffect, useId, useRef, useState } from 'react';
import {
  AGES,
  AGE_TIERS,
  BUILDINGS,
  RECIPES,
  RESOURCES,
  TECHNOLOGIES,
  UNITS,
  canBuildOrUpgradeBuilding,
  canCancelTask,
  calculateBuildingRepairCost,
  calculateRepairAllCost,
  canDemolishBuilding,
  getBuildingTierConfig,
  getBuildingTierUpgradeRule,
  getBuildingUpgradePreview,
  getEffectiveTileProtection,
  getMainTierChangeRule,
  getTaskCancelInfo,
  getUnitCombatStats,
  getUnitRefitRule,
  getUnitTrainingCost,
  groupBuildingRecipesByOutput,
  isTechTriggerSatisfied,
} from '@obelisk/shared';
import CopperAgeBuildingPanels from './CopperAgeBuildingPanels.jsx';
import CostInline from './CostInline.jsx';
import {
  formatRealDurationHMS,
  formatRealHoursHMS,
  getUnitAvailabilityColorClass,
} from '../utils/timeFormat.js';

/**
 * Native `<dialog>` building inspector and management modal.
 * Supports active-while-upgrading controls, building condition & repair/repair-all,
 * safe demolition, unit costs & dismissal, `[Research] -> [Craft]` tech transformation,
 * bottom Researched Technologies dropdown, output-grouped single Craft buttons, and previews.
 *
 * @param {object} props
 * @returns {import('react').JSX.Element | null}
 */
export default function BuildingModal({
  building,
  state,
  village,
  territory,
  maxPop,
  popUsed,
  freeUnits,
  onClose,
  onTrainUnit,
  onRefitUnitTier,
  onDismissUnit,
  onUpgradeBuilding,
  onUpgradeBuildingTier,
  onChangeMainTier,
  onStartCraft,
  onStartResearch,
  onRepairBuilding,
  onRepairAllBuildings,
  onCancelTask,
  onDemolishBuilding,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [craftQuantities, setCraftQuantities] = useState({});
  const [selectedVariants, setSelectedVariants] = useState({});
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  const handleModalClose = () => {
    setConfirmDestroy(false);
    onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (building && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!building && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }

    if (!building || 'closedBy' in HTMLDialogElement.prototype) return undefined;

    let pressedOutside = false;
    const isOutside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e) => {
      if (pressedOutside && isOutside(e)) {
        setConfirmDestroy(false);
        onClose();
      }
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [building, onClose]);

  const def = building ? BUILDINGS[building.buildingId] : null;
  const activeTier = building ? (building.tier ?? def?.tier ?? 1) : 1;
  const tierConfig = building ? getBuildingTierConfig(building.buildingId, activeTier) : null;
  const isAbandoned = Boolean(state.isAbandoned);
  const main = state.buildings.find((b) => b.buildingId === 'main') ?? building;
  const ageLabel = building ? (AGES[activeTier - 1] ?? 'stone') : 'stone';
  const activeSpeed = village?.effectiveSpeedFactor ?? state.speedFactor ?? 6;
  const effPenalty = state.efficiencyPenalty ?? 0;
  const dismissUnitFn = onDismissUnit ?? village?.dismissUnit;
  const refitUnitFn = onRefitUnitTier ?? village?.refitUnitTier;
  const repairFn = onRepairBuilding ?? village?.repairBuilding;
  const repairAllFn = onRepairAllBuildings ?? village?.repairAllBuildings;
  const cancelTaskFn = onCancelTask ?? village?.cancelTask;
  const demolishFn = onDemolishBuilding ?? village?.demolishBuilding;

  const activeBuildTask = building
    ? state.tasks.find(
        (t) =>
          (t.kind === 'build' ||
            t.kind === 'upgrade' ||
            t.kind === 'upgrade_main' ||
            t.kind === 'upgrade_tier') &&
          t.instanceId === building.instanceId,
      )
    : null;
  const activeCraftOrResearch = building
    ? state.tasks
        .filter(
          (t) =>
            (t.kind === 'craft' || t.kind === 'research' || t.kind === 'train_unit') &&
            t.buildingInstanceId === building.instanceId,
        )
        .sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0))
    : [];

  const nextLevel = (building?.level ?? 1) + 1;
  const levelUpgradeRule = building
    ? canBuildOrUpgradeBuilding({
        buildingId: building.buildingId,
        currentLevel: building.level,
        targetLevel: nextLevel,
        buildingTier: building.tier,
        mainTier: main.tier,
        unlockedTechs: state.unlockedTechs,
        unlockedBlueprints: state.unlockedBlueprints ?? [],
      })
    : null;
  const levelUpgradeCost = def
    ? Object.fromEntries(
        Object.entries(tierConfig?.cost ?? def.cost).map(([id, q]) => [
          id,
          q * activeTier * nextLevel,
        ]),
      )
    : {};
  const canAffordLevelUpgrade = Object.entries(levelUpgradeCost).every(
    ([id, q]) => (state.inventory[id] ?? 0) >= q,
  );
  const tierResetRule =
    building && building.buildingId !== 'main' && activeTier < (def?.maxTier ?? 3)
      ? getBuildingTierUpgradeRule({ building, mainTier: main.tier })
      : null;

  const tierUpRule =
    building?.buildingId === 'main' && building.tier < (def?.maxTier ?? AGES.length)
      ? getMainTierChangeRule({
          currentMainTier: building.tier,
          targetMainTier: building.tier + 1,
          unlockedTechs: state.unlockedTechs,
          hasExistingCapital: Boolean(village?.hasExistingCapital),
        })
      : null;
  const tierDownRule =
    building?.buildingId === 'main' && building.tier > 1
      ? getMainTierChangeRule({
          currentMainTier: building.tier,
          targetMainTier: building.tier - 1,
          unlockedTechs: state.unlockedTechs,
        })
      : null;

  const isUpgrading = Boolean(activeBuildTask) && building?.status === 'active';
  const upgradePreview = building ? getBuildingUpgradePreview({ building }) : null;
  const conditionPct = Math.round(building?.condition ?? 100);
  const graceDays = building?.graceDaysRemaining ?? 0;
  const repairCost = building ? calculateBuildingRepairCost(building) : {};
  const canRepair =
    !isAbandoned &&
    Object.keys(repairCost).length > 0 &&
    Object.entries(repairCost).every(([id, q]) => (state.inventory[id] ?? 0) >= q);

  const repairAllCost =
    building?.buildingId === 'main' ? calculateRepairAllCost(state.buildings) : {};
  const hasAnyDamaged = Object.keys(repairAllCost).length > 0;
  const canRepairAll =
    !isAbandoned &&
    hasAnyDamaged &&
    Object.entries(repairAllCost).every(([id, q]) => (state.inventory[id] ?? 0) >= q);

  const demolishCheck =
    building && building.buildingId !== 'main'
      ? canDemolishBuilding({
          building,
          buildings: state.buildings,
          units: state.units ?? {},
          starvationPopLoss: state.starvationPopLoss ?? 0,
        })
      : null;

  const pendingTechs = def
    ? def.researchesTechs.filter(
        (id) =>
          !state.unlockedTechs.includes(id) &&
          (AGE_TIERS[TECHNOLOGIES[id]?.age] ?? 1) <= activeTier,
      )
    : [];
  const researchedTechs = def
    ? def.researchesTechs.filter(
        (id) => state.unlockedTechs.includes(id) && !TECHNOLOGIES[id]?.unlocksRecipe,
      )
    : [];
  const recipeGroups = def
    ? groupBuildingRecipesByOutput({
        recipeIds: def.craftsRecipes,
        buildingTier: activeTier,
        unlockedTechs: state.unlockedTechs,
        inventory: state.inventory,
        water: state.water ?? 0,
      })
    : [];

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={handleModalClose}
      className="m-auto w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      {building && def ? (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 id={titleId} className="text-base font-bold text-amber-300">
                {tierConfig?.name ?? def.name} · ({building.x}, {building.y})
              </h2>
              <p className="text-xs text-slate-400">
                Tier {building.tier} (<span className="capitalize">{ageLabel} Age</span>) · Level{' '}
                {building.level}/{tierConfig?.maxLevel ?? def.maxLevel} ·{' '}
                <span
                  className={
                    conditionPct >= 60
                      ? 'text-emerald-300'
                      : conditionPct >= 25
                        ? 'text-amber-300'
                        : 'text-rose-400'
                  }
                >
                  Condition: {conditionPct}%
                </span>
                {graceDays > 0 ? ` (${graceDays}d buffer)` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={handleModalClose}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Close
            </button>
          </div>

          {(() => {
            const cur = upgradePreview?.current ?? {};
            const tileProt = getEffectiveTileProtection({
              buildings: state.buildings,
              wall: state.wall,
              x: building.x,
              y: building.y,
            });
            const bonusParts = [
              cur.storage > 0 ? `Storage: +${cur.storage}` : null,
              cur.preservedStorage > 0 ? `Granary: +${cur.preservedStorage}` : null,
              cur.popCap > 0 ? `Pop: +${cur.popCap}` : null,
              cur.waterCap > 0 ? `Water: +${cur.waterCap}` : null,
              cur.seedVault > 0 ? `Vault: ${cur.seedVault}` : null,
              cur.maxAttachments > 0 ? `Attachments: ${cur.maxAttachments}` : null,
              cur.penCapacity > 0 ? `Pen Cap: ${cur.penCapacity}` : null,
              cur.productionPerDay > 0 ? `Output: +${cur.productionPerDay}/d` : null,
              def.id === 'watchtower' && cur.wallDefensePercent > 0
                ? `3×3 Aura Defense: ${cur.wallDefensePercent}%`
                : tileProt.defensePercent > 0
                  ? `Tile Protection: ${tileProt.defensePercent}%`
                  : null,
            ].filter(Boolean);

            return bonusParts.length > 0 ? (
              <p className="mt-2 font-mono text-[11px] text-emerald-300">
                {bonusParts.join(' · ')}
              </p>
            ) : null;
          })()}

          {building.status === 'constructing' ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-amber-300">Building...</div>
                {!isAbandoned &&
                  activeBuildTask &&
                  cancelTaskFn &&
                  canCancelTask(activeBuildTask, state.virtualTimeMs).allowed && (
                    <button
                      type="button"
                      onClick={() => {
                        cancelTaskFn(activeBuildTask.id);
                        handleModalClose();
                      }}
                      className="rounded border border-rose-700/70 bg-rose-950/70 px-2 py-0.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/80"
                    >
                      Cancel
                    </button>
                  )}
              </div>
              <div className="mt-1 font-mono text-slate-200">
                Completion in:{' '}
                {formatRealDurationHMS(
                  (building.completedAtMs ?? state.virtualTimeMs) - state.virtualTimeMs,
                  activeSpeed,
                )}
              </div>
              {activeBuildTask?.returnsAtMs && (
                <div className="mt-0.5 font-mono text-slate-400">
                  Builder returns to Main in:{' '}
                  {formatRealDurationHMS(activeBuildTask.returnsAtMs - state.virtualTimeMs, activeSpeed)}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-xs">
              {isUpgrading && activeBuildTask && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-amber-300">
                      Upgrading... (Building remains active)
                    </div>
                    {!isAbandoned &&
                      cancelTaskFn &&
                      canCancelTask(activeBuildTask, state.virtualTimeMs).allowed && (
                        <button
                          type="button"
                          onClick={() => cancelTaskFn(activeBuildTask.id)}
                          className="rounded border border-rose-700/70 bg-rose-950/70 px-2 py-0.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-900/80"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                  <div className="mt-1 font-mono text-slate-200">
                    Completion in:{' '}
                    {formatRealDurationHMS(
                      (activeBuildTask.completedAtMs ?? state.virtualTimeMs) - state.virtualTimeMs,
                      activeSpeed,
                    )}
                  </div>
                  {activeBuildTask.returnsAtMs &&
                    activeBuildTask.returnsAtMs !== activeBuildTask.completedAtMs && (
                      <div className="mt-0.5 font-mono text-slate-400">
                        Builder returns to Main in:{' '}
                        {formatRealDurationHMS(activeBuildTask.returnsAtMs - state.virtualTimeMs, activeSpeed)}
                      </div>
                    )}
                </div>
              )}

              {/* Building Repair / Repair All */}
              {(Object.keys(repairCost).length > 0 || hasAnyDamaged) && (
                <section className="space-y-2 rounded-lg border border-amber-700/50 bg-slate-950/80 p-3">
                  {Object.keys(repairCost).length > 0 && repairFn && (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-amber-200">
                          Repair Building ({conditionPct}% → 100%)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Cost: <CostInline cost={repairCost} inventory={state.inventory} />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canRepair}
                        onClick={() => repairFn(building.instanceId)}
                        className={`rounded px-2.5 py-1 font-semibold ${
                          canRepair
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'cursor-not-allowed bg-slate-800 text-slate-500'
                        }`}
                      >
                        Repair
                      </button>
                    </div>
                  )}

                  {building.buildingId === 'main' && hasAnyDamaged && repairAllFn && (
                    <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                      <div>
                        <div className="font-semibold text-sky-200">Repair All Buildings</div>
                        <div className="text-[11px] text-slate-400">
                          Total Cost: <CostInline cost={repairAllCost} inventory={state.inventory} />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canRepairAll}
                        onClick={() => repairAllFn()}
                        className={`rounded px-2.5 py-1 font-semibold ${
                          canRepairAll
                            ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                            : 'cursor-not-allowed bg-slate-800 text-slate-500'
                        }`}
                      >
                        Repair All
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* MAIN Unit Training */}
              {def.trainsUnits.length > 0 && (
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-100">Train Units</h3>
                    <span className="font-mono text-[11px] text-slate-400">
                      Pop Used: {popUsed}/{maxPop}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {def.trainsUnits
                      .filter((unitId) => (main?.tier ?? 1) >= (UNITS[unitId]?.tier ?? 1))
                      .map((unitId) => {
                        const u = UNITS[unitId];
                        const curCount = state.units[unitId] ?? 0;
                        const curUnitTier = state.unitTiers?.[unitId] ?? u.tier;
                        const unitCost = getUnitTrainingCost(
                          unitId,
                          state.unlockedTechs,
                          state.unitTiers,
                        );
                        const canAffordUnit = Object.entries(unitCost).every(
                          ([id, q]) => (state.inventory[id] ?? 0) >= q,
                        );
                        const missingAnimals = Object.entries(u.requiredAnimal ?? {}).filter(
                          ([animalId, q]) => (state.animals?.[animalId] ?? 0) < q,
                        );
                        const hasAnimals = missingAnimals.length === 0;
                        const prosOk =
                          unitId !== 'prospector' || state.unlockedTechs.includes('bone_pickaxe');
                        const missingTechs = (u.requiredTechs ?? []).filter(
                          (t) => !state.unlockedTechs.includes(t),
                        );
                        const techsOk = missingTechs.length === 0;
                        const refitRule =
                          u.upgradeTechs?.length > 0 && curCount > 0
                            ? getUnitRefitRule({
                                unitId,
                                currentCount: curCount,
                                currentUnitTier: curUnitTier,
                                unlockedTechs: state.unlockedTechs,
                                inventory: state.inventory,
                              })
                            : null;
                        const showRefitRow =
                          refitRule && refitRule.targetTier > curUnitTier && refitUnitFn;
                        const combatStats = getUnitCombatStats(unitId, curUnitTier);
                        const tierBadgeLabel =
                          curUnitTier >= 5
                            ? 'Crossbow Tier'
                            : curUnitTier === 4
                              ? 'Iron Tier'
                              : curUnitTier === 3
                                ? 'Bronze Tier'
                                : 'Copper Tier';
                        const canTrain =
                          !isAbandoned &&
                          prosOk &&
                          techsOk &&
                          hasAnimals &&
                          canAffordUnit &&
                          popUsed + u.popCost <= maxPop;
                        return (
                          <div
                            key={unitId}
                            className="flex flex-col gap-1.5 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 font-medium text-slate-100">
                                  <span className="text-white">
                                    {u.name} (
                                    <span
                                      className={getUnitAvailabilityColorClass(
                                        freeUnits[unitId] ?? 0,
                                        curCount,
                                      )}
                                    >
                                      {freeUnits[unitId] ?? 0}/{curCount}
                                    </span>{' '}
                                    free)
                                  </span>
                                  {u.upgradeTechs?.length > 0 && (
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                                        curUnitTier >= 4
                                          ? 'bg-cyan-500/20 text-cyan-300'
                                          : curUnitTier === 3
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : 'bg-slate-800 text-slate-400'
                                      }`}
                                    >
                                      {tierBadgeLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Pop: {u.popCost}
                                  {u.trainingTimeHours > 0 && (
                                    <>
                                      {' · '}
                                      Time:{' '}
                                      {formatRealHoursHMS(u.trainingTimeHours, activeSpeed, effPenalty)}
                                    </>
                                  )}
                                  {u.attack > 0 && (
                                    <>
                                      {' · '}
                                      Atk/Def: {combatStats.attack}/{combatStats.defense}
                                    </>
                                  )}
                                  {Object.keys(unitCost).length > 0 && (
                                    <>
                                      {' · Cost: '}
                                      <CostInline cost={unitCost} inventory={state.inventory} />
                                    </>
                                  )}
                                  {Object.keys(u.requiredAnimal ?? {}).length > 0 && (
                                    <>
                                      {' · '}
                                      <span
                                        className={
                                          missingAnimals.length > 0
                                            ? 'font-semibold text-rose-400'
                                            : 'text-slate-300'
                                        }
                                      >
                                        Needs:{' '}
                                        {Object.entries(u.requiredAnimal)
                                          .map(([a, q]) => `${state.animals?.[a] ?? 0}/${q} ${a}`)
                                          .join(', ')}
                                      </span>
                                    </>
                                  )}
                                  {!prosOk && (
                                    <>
                                      {' · '}
                                      <span className="font-semibold text-rose-400">
                                        Needs Bone Pickaxe
                                      </span>
                                    </>
                                  )}
                                  {!techsOk && (
                                    <>
                                      {' · '}
                                      <span className="font-semibold text-rose-400">
                                        Needs {missingTechs.map((t) => TECHNOLOGIES[t]?.name ?? t).join(', ')}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {dismissUnitFn && (
                                  <button
                                    type="button"
                                    aria-label={`Dispense 1 ${u.name}`}
                                    disabled={isAbandoned || (freeUnits[unitId] ?? 0) < 1}
                                    onClick={() => dismissUnitFn(unitId)}
                                    className={`rounded border px-2 py-1 font-semibold transition ${
                                      !isAbandoned && (freeUnits[unitId] ?? 0) >= 1
                                        ? 'border-rose-700/70 bg-rose-950/60 text-rose-200 hover:bg-rose-900/70'
                                        : 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600'
                                    }`}
                                  >
                                    Dispense -1
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={!canTrain}
                                  onClick={() => onTrainUnit(unitId, building.instanceId)}
                                  className={`rounded px-2.5 py-1 font-semibold transition ${
                                    canTrain
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                      : 'cursor-not-allowed bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  Train +1
                                </button>
                              </div>
                            </div>

                            {showRefitRow && (
                              <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-1.5 text-[11px]">
                                <div className="text-amber-200">
                                  Refit {curCount} to {refitRule.targetLabel}:{' '}
                                  {refitRule.missingTechs.length > 0 ? (
                                    <span className="text-rose-400">
                                      Requires {refitRule.missingTechs.map((t) => TECHNOLOGIES[t]?.name ?? t).join(', ')}
                                    </span>
                                  ) : (
                                    <CostInline cost={refitRule.cost} inventory={state.inventory} />
                                  )}
                                </div>
                                <button
                                  type="button"
                                  disabled={isAbandoned || !refitRule.allowed}
                                  onClick={() => refitUnitFn(unitId)}
                                  className={`rounded px-2 py-0.5 font-semibold ${
                                    !isAbandoned && refitRule.allowed
                                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                      : 'cursor-not-allowed bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  Refit → {refitRule.targetLabel}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </section>
              )}

              {/* Pending Technology Research (unlocked recipe techs transform into Craft rows below) */}
              {pendingTechs.length > 0 && (
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <h3 className="mb-2 font-semibold text-slate-100">Technology Research</h3>
                  <div className="space-y-2">
                    {pendingTechs.map((techId) => {
                      const tech = TECHNOLOGIES[techId];
                      const isResearching = activeCraftOrResearch.some((t) => t.techId === techId);
                      const prereqsOk = tech.prerequisites.every((p) =>
                        state.unlockedTechs.includes(p),
                      );
                      const triggerOk =
                        prereqsOk &&
                        isTechTriggerSatisfied(techId, {
                          builtBuildings: state.buildings,
                          craftedCounts: state.craftedCounts,
                          unlockedBlueprints: state.unlockedBlueprints ?? [],
                        });
                      const canAfford = Object.entries(tech.cost).every(
                        ([id, q]) => (state.inventory[id] ?? 0) >= q,
                      );

                      return (
                        <div
                          key={techId}
                          className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                        >
                          <div>
                            <div className="font-medium text-amber-200">
                              {tech.name}
                              {tech.unlocksRecipe && (
                                <span className="ml-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
                                  → Craft
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-300">
                              Cost: <CostInline cost={tech.cost} inventory={state.inventory} /> ·{' '}
                              {formatRealHoursHMS(tech.researchTimeHours, activeSpeed, effPenalty)}
                            </div>
                          </div>
                          {isResearching ? (
                            <span className="rounded bg-amber-500/20 px-2 py-1 font-mono text-amber-300">
                              Researching...
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isAbandoned || !triggerOk || !canAfford}
                              onClick={() =>
                                onStartResearch({ buildingInstanceId: building.instanceId, techId })
                              }
                              className={`rounded px-2.5 py-1 font-semibold ${
                                !isAbandoned && triggerOk && canAfford
                                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
                              }`}
                            >
                              Research
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Grouped Crafting Recipes (1 Craft button per product item) */}
              {recipeGroups.length > 0 && (
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <h3 className="mb-2 font-semibold text-slate-100">Crafting</h3>
                  <div className="space-y-2">
                    {recipeGroups.map((group) => {
                      const manualVariantId = selectedVariants[group.primaryOutputId];
                      const chosenRecipe =
                        group.recipes.find((r) => r.id === manualVariantId) ?? group.activeRecipe;
                      const displayLabel =
                        group.recipes.length === 1 ? chosenRecipe.name : group.outputName;

                      const waterCost = chosenRecipe.waterCostBowls ?? 0;
                      const inputLimits = Object.entries(chosenRecipe.inputs).map(([id, q]) =>
                        q > 0 ? Math.floor((state.inventory[id] ?? 0) / q) : 999,
                      );
                      const waterLimit =
                        waterCost > 0 ? Math.floor((state.water ?? 0) / waterCost) : 999;
                      const maxCraftable = Math.max(
                        0,
                        Math.min(999, ...inputLimits, waterLimit),
                      );
                      const rawQty = craftQuantities[group.primaryOutputId] ?? 1;
                      const selectedQty =
                        maxCraftable > 0
                          ? Math.max(1, Math.min(maxCraftable, Math.floor(rawQty) || 1))
                          : 1;
                      const canCraft = !isAbandoned && maxCraftable >= 1;

                      const scaledInputs = Object.fromEntries(
                        Object.entries(chosenRecipe.inputs).map(([id, q]) => [id, q * selectedQty]),
                      );
                      const scaledWater = waterCost * selectedQty;

                      return (
                        <div
                          key={group.primaryOutputId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-100">
                              <span>{displayLabel}</span>
                              {chosenRecipe.unlocksTech && (
                                <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] capitalize text-orange-300">
                                  Unlocks {chosenRecipe.unlocksAge ?? chosenRecipe.unlocksTech} Age
                                </span>
                              )}
                              {group.recipes.length > 1 &&
                                group.recipes.map((variant) => {
                                  const keys = Object.keys(variant.inputs);
                                  const viaLabel = keys.includes('coal')
                                    ? keys.some((k) => k.endsWith('_ore'))
                                      ? 'Ore+Coal'
                                      : 'Coal'
                                    : keys.some((k) => k.includes('_ore'))
                                      ? 'Ore'
                                      : keys.some((k) => k.includes('_nugget'))
                                        ? 'Nuggets'
                                        : keys.includes('charcoal')
                                          ? 'Charcoal'
                                          : keys.includes('salt')
                                            ? 'Salt'
                                            : keys.includes('wood_ash')
                                              ? 'Ash'
                                              : keys.includes('flax')
                                                ? 'Flax'
                                                : keys.includes('straw')
                                                  ? 'Straw'
                                                  : variant.name;
                                  const isCurrent = variant.id === chosenRecipe.id;
                                  return (
                                    <button
                                      key={variant.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedVariants((prev) => ({
                                          ...prev,
                                          [group.primaryOutputId]: variant.id,
                                        }))
                                      }
                                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                                        isCurrent
                                          ? 'border-sky-500/70 bg-sky-500/20 text-sky-200'
                                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      via {viaLabel}
                                    </button>
                                  );
                                })}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              <CostInline
                                cost={scaledInputs}
                                inventory={state.inventory}
                                waterCost={scaledWater}
                                currentWater={state.water ?? 0}
                              />{' '}
                              →{' '}
                              {Object.entries(chosenRecipe.outputs)
                                .map(([id, q]) => `${q * selectedQty} ${RESOURCES[id]?.name ?? id}`)
                                .join(', ')}{' '}
                              ({formatRealHoursHMS(chosenRecipe.craftTimeHours * selectedQty, activeSpeed, effPenalty)})
                            </div>
                          </div>

                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <button
                              type="button"
                              aria-label={`Decrease quantity for ${displayLabel}`}
                              disabled={isAbandoned || selectedQty <= 1}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [group.primaryOutputId]: Math.max(1, selectedQty - 1),
                                }))
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(1, maxCraftable)}
                              disabled={isAbandoned || maxCraftable <= 0}
                              aria-label={`Quantity for ${displayLabel}`}
                              value={selectedQty}
                              onChange={(e) =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [group.primaryOutputId]: Math.max(
                                    1,
                                    Math.floor(Number(e.target.value) || 1),
                                  ),
                                }))
                              }
                              className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-center text-slate-100 disabled:opacity-40"
                            />
                            <button
                              type="button"
                              aria-label={`Increase quantity for ${displayLabel}`}
                              disabled={isAbandoned || selectedQty >= maxCraftable}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [group.primaryOutputId]: Math.min(
                                    Math.max(1, maxCraftable),
                                    selectedQty + 1,
                                  ),
                                }))
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              aria-label={`Max quantity for ${displayLabel}`}
                              disabled={!canCraft}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [group.primaryOutputId]: Math.max(1, maxCraftable),
                                }))
                              }
                              className="rounded border border-amber-600/60 bg-amber-950/50 px-1.5 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-900/60 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Max
                            </button>
                            <button
                              type="button"
                              disabled={!canCraft}
                              onClick={() => {
                                onStartCraft({
                                  buildingInstanceId: building.instanceId,
                                  recipeId: chosenRecipe.id,
                                  quantity: selectedQty,
                                });
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [group.primaryOutputId]: 1,
                                }));
                              }}
                              className={`ml-1 rounded px-2.5 py-1 font-sans font-semibold ${
                                canCraft
                                  ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
                              }`}
                            >
                              Craft
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Sequential Building Production / Research Queue (1 item at a time) */}
              {activeCraftOrResearch.length > 0 && (
                <section className="rounded-lg border border-sky-800/60 bg-sky-950/30 p-2.5">
                  <div className="font-semibold text-sky-300">Active Work Queue (Sequential)</div>
                  {activeCraftOrResearch.map((t, idx) => {
                    const qtyPrefix = (t.quantity ?? 1) > 1 ? `${t.quantity}x ` : '';
                    const taskLabel =
                      t.kind === 'train_unit'
                        ? `${qtyPrefix}Recruit ${UNITS[t.unitId]?.name ?? t.unitId}`
                        : t.recipeId
                          ? `${qtyPrefix}${RECIPES[t.recipeId].name}`
                          : TECHNOLOGIES[t.techId].name;
                    const cancelInfo =
                      !isAbandoned && cancelTaskFn
                        ? getTaskCancelInfo(t, state.virtualTimeMs)
                        : { allowed: false, cancelMode: null };
                    const isFirstInQueue = idx === 0 && (t.startedAtMs ?? 0) <= state.virtualTimeMs;
                    const currentItemEndMs = t.nextItemCompletedAtMs ?? t.completedAtMs;
                    const cancelLabel =
                      cancelInfo.cancelMode === 'waiting_only'
                        ? `Cancel Queued (${(t.quantity ?? 1) - 1})`
                        : 'Cancel';
                    return (
                      <div
                        key={t.id}
                        className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                              isFirstInQueue
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isFirstInQueue ? 'Active' : 'Queued'}
                          </span>
                          <span>{taskLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {cancelInfo.allowed && (
                            <button
                              type="button"
                              onClick={() => cancelTaskFn(t.id)}
                              className="rounded border border-rose-700/70 bg-rose-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-900/80"
                            >
                              {cancelLabel}
                            </button>
                          )}
                          <span>
                            {isFirstInQueue && (t.quantity ?? 1) > 1
                              ? `${formatRealDurationHMS(currentItemEndMs - state.virtualTimeMs, activeSpeed)} (${formatRealDurationHMS(t.completedAtMs - state.virtualTimeMs, activeSpeed)})`
                              : formatRealDurationHMS(t.completedAtMs - state.virtualTimeMs, activeSpeed)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {village && (
                <CopperAgeBuildingPanels
                  building={building}
                  state={state}
                  village={village}
                  territory={territory}
                  freeUnits={freeUnits}
                />
              )}

              {/* Tier Upgrade (Resets Level to 1 at Next Tier) */}
              {tierResetRule && (
                <section className="flex items-center justify-between gap-2 rounded-lg border border-amber-800/70 bg-amber-950/30 p-3">
                  <div>
                    <div className="font-semibold text-amber-200">
                      Advance to Tier {tierResetRule.targetTier}: {tierResetRule.targetName} (Resets Lv 1)
                    </div>
                    {upgradePreview?.nextTier?.summary && (
                      <div className="text-[11px] font-medium text-emerald-300">
                        Improves: {upgradePreview.nextTier.summary}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-300">
                      {Object.keys(tierResetRule.cost).length > 0 ? (
                        <>
                          Cost: <CostInline cost={tierResetRule.cost} inventory={state.inventory} />
                        </>
                      ) : (
                        'Free Upgrade'
                      )}
                      {tierResetRule.buildTimeHours > 0
                        ? ` · ${formatRealHoursHMS(tierResetRule.buildTimeHours, activeSpeed, effPenalty)}`
                        : ''}
                    </div>
                    {!tierResetRule.allowed && (
                      <div className="text-[11px] text-rose-400">{tierResetRule.reason}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={
                      isAbandoned ||
                      isUpgrading ||
                      !tierResetRule.allowed ||
                      freeUnits.builder < tierResetRule.buildersRequired ||
                      !Object.entries(tierResetRule.cost).every(
                        ([id, q]) => (state.inventory[id] ?? 0) >= q,
                      )
                    }
                    onClick={() => onUpgradeBuildingTier?.(building.instanceId)}
                    className={`rounded px-2.5 py-1 font-semibold ${
                      !isAbandoned &&
                      !isUpgrading &&
                      tierResetRule.allowed &&
                      freeUnits.builder >= tierResetRule.buildersRequired &&
                      Object.entries(tierResetRule.cost).every(
                        ([id, q]) => (state.inventory[id] ?? 0) >= q,
                      )
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'cursor-not-allowed bg-slate-800 text-slate-500'
                    }`}
                  >
                    Advance Tier
                  </button>
                </section>
              )}

              {/* Level Upgrade */}
              {building.level < (tierConfig?.maxLevel ?? def.maxLevel) && (
                <section className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div>
                    <div className="font-semibold text-slate-100">Upgrade to Level {nextLevel}</div>
                    {upgradePreview?.nextLevel?.summary && (
                      <div className="text-[11px] font-medium text-emerald-300">
                        Improves: {upgradePreview.nextLevel.summary}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Cost: <CostInline cost={levelUpgradeCost} inventory={state.inventory} /> ·{' '}
                      {formatRealHoursHMS(
                        levelUpgradeRule.buildTimeHours ?? def.buildTimeHours,
                        activeSpeed,
                        effPenalty,
                      )}
                    </div>
                    {!levelUpgradeRule.allowed && (
                      <div className="text-[11px] text-rose-400">{levelUpgradeRule.reason}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={
                      isAbandoned ||
                      isUpgrading ||
                      !levelUpgradeRule.allowed ||
                      !canAffordLevelUpgrade ||
                      freeUnits.builder < 1
                    }
                    onClick={() => onUpgradeBuilding(building.instanceId)}
                    className={`rounded px-2.5 py-1 font-semibold ${
                      !isAbandoned &&
                      !isUpgrading &&
                      levelUpgradeRule.allowed &&
                      canAffordLevelUpgrade &&
                      freeUnits.builder >= 1
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'cursor-not-allowed bg-slate-800 text-slate-500'
                    }`}
                  >
                    Upgrade
                  </button>
                </section>
              )}

              {/* MAIN Age Tier Upgrade / Free Downgrade */}
              {building.buildingId === 'main' && (
                <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <h3 className="font-semibold text-amber-300">Main Age Controller</h3>
                  {tierUpRule && (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-100">
                          Advance to Tier {building.tier + 1} (
                          <span className="capitalize">{tierUpRule.targetAge}</span> Age)
                        </div>
                        {upgradePreview?.nextTier?.summary && (
                          <div className="text-[11px] font-medium text-emerald-300">
                            Improves: {upgradePreview.nextTier.summary}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400">
                          {Object.keys(tierUpRule.cost).length > 0 ? (
                            <>
                              Cost: <CostInline cost={tierUpRule.cost} inventory={state.inventory} />{' '}
                              · {formatRealHoursHMS(tierUpRule.buildTimeHours, activeSpeed, effPenalty)}
                            </>
                          ) : (
                            tierUpRule.reason
                          )}
                        </div>
                        {tierUpRule.reason && Object.keys(tierUpRule.cost).length > 0 && (
                          <div className="text-[11px] text-rose-400">{tierUpRule.reason}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={
                          isAbandoned ||
                          isUpgrading ||
                          !tierUpRule.allowed ||
                          freeUnits.builder < tierUpRule.buildersRequired ||
                          !Object.entries(tierUpRule.cost).every(
                            ([id, q]) => (state.inventory[id] ?? 0) >= q,
                          )
                        }
                        onClick={() => onChangeMainTier(building.tier + 1)}
                        className={`rounded px-2.5 py-1 font-semibold ${
                          !isAbandoned &&
                          !isUpgrading &&
                          tierUpRule.allowed &&
                          freeUnits.builder >= tierUpRule.buildersRequired &&
                          Object.entries(tierUpRule.cost).every(
                            ([id, q]) => (state.inventory[id] ?? 0) >= q,
                          )
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'cursor-not-allowed bg-slate-800 text-slate-500'
                        }`}
                      >
                        Advance Age
                      </button>
                    </div>
                  )}

                  {tierDownRule?.allowed && (
                    <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                      <div className="text-[11px] text-slate-400">
                        Downgrade Main to Tier {building.tier - 1} (Free)
                      </div>
                      <button
                        type="button"
                        disabled={isAbandoned || isUpgrading}
                        onClick={() => onChangeMainTier(building.tier - 1)}
                        className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Downgrade (Free)
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Researched Technologies Dropdown at Bottom */}
              {researchedTechs.length > 0 && (
                <details className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-300 hover:text-white">
                    Researched Technologies ({researchedTechs.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {researchedTechs.map((techId) => (
                      <li
                        key={techId}
                        className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px]"
                      >
                        <span className="font-medium text-emerald-300">
                          {TECHNOLOGIES[techId]?.name ?? techId}
                        </span>
                        <span className="text-[10px] uppercase text-slate-400">Researched</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Destroy Building (Non-Main) */}
              {building.buildingId !== 'main' && demolishFn && demolishCheck && (
                <section className="flex items-center justify-between gap-2 rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
                  <div>
                    <div className="font-semibold text-rose-300">Destroy Building</div>
                    {!demolishCheck.allowed && (
                      <div className="text-[11px] text-rose-400">{demolishCheck.reason}</div>
                    )}
                  </div>
                  {!confirmDestroy ? (
                    <button
                      type="button"
                      disabled={isAbandoned || !demolishCheck.allowed}
                      onClick={() => setConfirmDestroy(true)}
                      className="rounded border border-rose-700/70 bg-rose-950/70 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Destroy Building
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          demolishFn(building.instanceId);
                          setConfirmDestroy(false);
                          onClose();
                        }}
                        className="rounded bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-500"
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
                  )}
                </section>
              )}
            </div>
          )}
        </>
      ) : null}
    </dialog>
  );
}
