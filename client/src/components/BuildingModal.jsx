import { useEffect, useId, useRef } from 'react';
import {
  AGES,
  BUILDINGS,
  RECIPES,
  RESOURCES,
  TECHNOLOGIES,
  UNITS,
  canBuildOrUpgradeBuilding,
  getMainTierChangeRule,
  isTechTriggerSatisfied,
} from '@obelisk/shared';
import { formatCostSummary, formatGameDuration } from '../utils/timeFormat.js';

/**
 * Native `<dialog>` building inspector and management modal.
 * Shows `"Building..."` + countdown timers while constructing, and unit training,
 * tech research (`FIREPIT`), crafting (`FIREPIT` / `KILN`), level upgrades, and `MAIN` Tier
 * Age controller actions once active.
 *
 * @param {object} props
 * @param {object | null} props.building - Selected building instance (or null when closed).
 * @param {object} props.state - Full village state snapshot.
 * @param {number} props.maxPop
 * @param {number} props.popUsed
 * @param {{ gatherer: number, hunter: number, builder: number }} props.freeUnits
 * @param {() => void} props.onClose
 * @param {(unitId: string) => void} props.onTrainUnit
 * @param {(instanceId: string) => void} props.onUpgradeBuilding
 * @param {(targetTier: number) => void} props.onChangeMainTier
 * @param {(params: { buildingInstanceId: string, recipeId: string }) => void} props.onStartCraft
 * @param {(params: { buildingInstanceId: string, techId: string }) => void} props.onStartResearch
 * @returns {import('react').JSX.Element | null}
 */
export default function BuildingModal({
  building,
  state,
  maxPop,
  popUsed,
  freeUnits,
  onClose,
  onTrainUnit,
  onUpgradeBuilding,
  onChangeMainTier,
  onStartCraft,
  onStartResearch,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

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

    // Fallback for browsers without <dialog closedby="any"> outside-press dismissal.
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
      if (pressedOutside && isOutside(e)) onClose();
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, [building, onClose]);

  const def = building ? BUILDINGS[building.buildingId] : null;
  const isAbandoned = Boolean(state.isAbandoned);
  const main = state.buildings.find((b) => b.buildingId === 'main') ?? building;
  const ageLabel = building ? (AGES[(building.tier ?? 1) - 1] ?? 'stone') : 'stone';
  const activeBuildTask = building
    ? state.tasks.find(
        (t) =>
          (t.kind === 'build' || t.kind === 'upgrade' || t.kind === 'upgrade_main') &&
          t.instanceId === building.instanceId,
      )
    : null;
  const activeCraftOrResearch = building
    ? state.tasks.filter(
        (t) =>
          (t.kind === 'craft' || t.kind === 'research') &&
          t.buildingInstanceId === building.instanceId,
      )
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
      })
    : null;
  const levelUpgradeCost = def
    ? Object.fromEntries(Object.entries(def.cost).map(([id, q]) => [id, q * nextLevel]))
    : {};
  const canAffordLevelUpgrade = Object.entries(levelUpgradeCost).every(
    ([id, q]) => (state.inventory[id] ?? 0) >= q,
  );

  const tierUpRule =
    building?.buildingId === 'main'
      ? getMainTierChangeRule({
          currentMainTier: building.tier,
          targetMainTier: building.tier + 1,
          unlockedTechs: state.unlockedTechs,
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

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      {building && def ? (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 id={titleId} className="text-base font-bold text-amber-300">
                {def.name} · ({building.x}, {building.y})
              </h2>
              <p className="text-xs text-slate-400">
                Tier {building.tier} (<span className="capitalize">{ageLabel} Age</span>) · Level{' '}
                {building.level}/{def.maxLevel}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Close
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-300">{def.description}</p>
          {(() => {
            const waterBonus =
              Array.isArray(def.waterCapacityByLevel) && def.waterCapacityByLevel.length > 0
                ? def.waterCapacityByLevel[
                    Math.min(
                      Math.max(1, building.level ?? 1) - 1,
                      def.waterCapacityByLevel.length - 1,
                    )
                  ]
                : def.waterCapacity * building.level;

            const bonusParts = [
              def.storageBonusPerLevel > 0
                ? `Pooled Storage Bonus: +${def.storageBonusPerLevel * building.level} bulk`
                : null,
              def.popBonusPerLevel > 0
                ? `Housing Bonus: +${def.popBonusPerLevel * building.level} max pop`
                : null,
              waterBonus > 0 ? `Water Storage Bonus: +${waterBonus} bowls` : null,
            ].filter(Boolean);

            return bonusParts.length > 0 ? (
              <p className="mt-1 font-mono text-[11px] text-emerald-300">
                {bonusParts.join(' · ')}
              </p>
            ) : null;
          })()}

          {building.status === 'constructing' ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs">
              <div className="font-bold text-amber-300">Building...</div>
              <div className="mt-1 font-mono text-slate-200">
                Completion in:{' '}
                {formatGameDuration((building.completedAtMs ?? state.virtualTimeMs) - state.virtualTimeMs)}
              </div>
              {activeBuildTask?.returnsAtMs && (
                <div className="mt-0.5 font-mono text-slate-400">
                  Builder returns to Main in:{' '}
                  {formatGameDuration(activeBuildTask.returnsAtMs - state.virtualTimeMs)}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-xs">
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
                    {def.trainsUnits.map((unitId) => {
                      const u = UNITS[unitId];
                      const canTrain = !isAbandoned && popUsed + u.popCost <= maxPop;
                      return (
                        <div
                          key={unitId}
                          className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                        >
                          <div>
                            <div className="font-medium text-slate-100">
                              {u.name} ({freeUnits[unitId]}/{state.units[unitId] ?? 0} free)
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {u.speedKmPerHour} km/h · Train: {u.trainingTimeHours}h · Pop: {u.popCost}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!canTrain}
                            onClick={() => onTrainUnit(unitId)}
                            className={`rounded px-2.5 py-1 font-semibold transition ${
                              canTrain
                                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                : 'cursor-not-allowed bg-slate-800 text-slate-500'
                            }`}
                          >
                            Train +1
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* FIREPIT Research Technologies */}
              {def.researchesTechs.length > 0 && (
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <h3 className="mb-2 font-semibold text-slate-100">Technology Research</h3>
                  <div className="space-y-2">
                    {def.researchesTechs.map((techId) => {
                      const tech = TECHNOLOGIES[techId];
                      const isUnlocked = state.unlockedTechs.includes(techId);
                      const isResearching = activeCraftOrResearch.some((t) => t.techId === techId);
                      const triggerOk = isTechTriggerSatisfied(techId, {
                        builtBuildings: state.buildings,
                        craftedCounts: state.craftedCounts,
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
                            <div className="font-medium text-amber-200">{tech.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {tech.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-300">
                              Cost: {formatCostSummary(tech.cost)} · {tech.researchTimeHours}h
                            </div>
                          </div>
                          {isUnlocked ? (
                            <span className="rounded bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-300">
                              Unlocked
                            </span>
                          ) : isResearching ? (
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

              {/* Crafting Recipes */}
              {def.craftsRecipes.length > 0 && (
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <h3 className="mb-2 font-semibold text-slate-100">Crafting</h3>
                  <div className="space-y-2">
                    {def.craftsRecipes.map((recipeId) => {
                      const recipe = RECIPES[recipeId];
                      const waterCost = recipe.waterCostBowls ?? 0;
                      const hasWater = (state.water ?? 0) >= waterCost;
                      const canAfford = Object.entries(recipe.inputs).every(
                        ([id, q]) => (state.inventory[id] ?? 0) >= q,
                      );
                      const canCraft = !isAbandoned && canAfford && hasWater;

                      return (
                        <div
                          key={recipeId}
                          className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                        >
                          <div>
                            <div className="font-medium text-slate-100">
                              {recipe.name}
                              {recipe.unlocksTech && (
                                <span className="ml-2 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-300">
                                  Unlocks Copper Age
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {formatCostSummary(recipe.inputs)}
                              {waterCost > 0 ? ` + ${waterCost} Water Bowls` : ''} →{' '}
                              {Object.entries(recipe.outputs)
                                .map(([id, q]) => `${q} ${RESOURCES[id]?.name ?? id}`)
                                .join(', ')}{' '}
                              ({recipe.craftTimeHours}h)
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!canCraft}
                            onClick={() =>
                              onStartCraft({ buildingInstanceId: building.instanceId, recipeId })
                            }
                            className={`rounded px-2.5 py-1 font-semibold ${
                              canCraft
                                ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
                                : 'cursor-not-allowed bg-slate-800 text-slate-500'
                            }`}
                          >
                            Craft
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Active Crafting/Research Timers inside this building */}
              {activeCraftOrResearch.length > 0 && (
                <section className="rounded-lg border border-sky-800/60 bg-sky-950/30 p-2.5">
                  <div className="font-semibold text-sky-300">Active Work Queue</div>
                  {activeCraftOrResearch.map((t) => (
                    <div key={t.id} className="mt-1 flex justify-between font-mono text-[11px]">
                      <span>{t.recipeId ? RECIPES[t.recipeId].name : TECHNOLOGIES[t.techId].name}</span>
                      <span>{formatGameDuration(t.completedAtMs - state.virtualTimeMs)}</span>
                    </div>
                  ))}
                </section>
              )}

              {/* Level Upgrade */}
              {building.level < def.maxLevel && (
                <section className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div>
                    <div className="font-semibold text-slate-100">Upgrade to Level {nextLevel}</div>
                    <div className="text-[11px] text-slate-400">
                      Cost: {formatCostSummary(levelUpgradeCost)}
                    </div>
                    {!levelUpgradeRule.allowed && (
                      <div className="text-[11px] text-rose-400">{levelUpgradeRule.reason}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={
                      isAbandoned ||
                      !levelUpgradeRule.allowed ||
                      !canAffordLevelUpgrade ||
                      freeUnits.builder < 1
                    }
                    onClick={() => onUpgradeBuilding(building.instanceId)}
                    className={`rounded px-2.5 py-1 font-semibold ${
                      !isAbandoned &&
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
                        <div className="text-[11px] text-slate-400">
                          {Object.keys(tierUpRule.cost).length > 0
                            ? `Cost: ${formatCostSummary(tierUpRule.cost)} · ${tierUpRule.buildTimeHours}h`
                            : tierUpRule.reason}
                        </div>
                        {tierUpRule.reason && Object.keys(tierUpRule.cost).length > 0 && (
                          <div className="text-[11px] text-rose-400">{tierUpRule.reason}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={
                          isAbandoned ||
                          !tierUpRule.allowed ||
                          freeUnits.builder < tierUpRule.buildersRequired ||
                          !Object.entries(tierUpRule.cost).every(
                            ([id, q]) => (state.inventory[id] ?? 0) >= q,
                          )
                        }
                        onClick={() => onChangeMainTier(building.tier + 1)}
                        className={`rounded px-2.5 py-1 font-semibold ${
                          !isAbandoned &&
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
                        Downgrade Main to Tier {building.tier - 1} (Free; keeps existing buildings).
                      </div>
                      <button
                        type="button"
                        disabled={isAbandoned}
                        onClick={() => onChangeMainTier(building.tier - 1)}
                        className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Downgrade (Free)
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
