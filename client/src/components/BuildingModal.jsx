import { useEffect, useId, useRef, useState } from 'react';
import {
  AGES,
  BUILDINGS,
  RECIPES,
  RESOURCES,
  TECHNOLOGIES,
  UNITS,
  canBuildOrUpgradeBuilding,
  getBuildingTierUpgradeRule,
  getBuildingUpgradePreview,
  getMainTierChangeRule,
  isTechTriggerSatisfied,
} from '@obelisk/shared';
import CopperAgeBuildingPanels from './CopperAgeBuildingPanels.jsx';
import CostInline from './CostInline.jsx';
import { formatGameDuration } from '../utils/timeFormat.js';

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
  village,
  territory,
  maxPop,
  popUsed,
  freeUnits,
  onClose,
  onTrainUnit,
  onUpgradeBuilding,
  onUpgradeBuildingTier,
  onChangeMainTier,
  onStartCraft,
  onStartResearch,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [craftQuantities, setCraftQuantities] = useState({});

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
          (t.kind === 'build' ||
            t.kind === 'upgrade' ||
            t.kind === 'upgrade_main' ||
            t.kind === 'upgrade_tier') &&
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
    ? Object.fromEntries(
        Object.entries(def.cost).map(([id, q]) => [
          id,
          q * (building.tier ?? def.tier) * nextLevel,
        ]),
      )
    : {};
  const canAffordLevelUpgrade = Object.entries(levelUpgradeCost).every(
    ([id, q]) => (state.inventory[id] ?? 0) >= q,
  );
  const tierResetRule =
    building && building.buildingId !== 'main' && building.level >= (def?.maxLevel ?? 3)
      ? getBuildingTierUpgradeRule({ building, mainTier: main.tier })
      : null;

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

  const isUpgrading = Boolean(activeBuildTask) && building?.status === 'active';
  const upgradePreview = building ? getBuildingUpgradePreview({ building }) : null;

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

          {(() => {
            const cur = upgradePreview?.current ?? {};
            const bonusParts = [
              cur.storage > 0 ? `Storage: +${cur.storage}` : null,
              cur.preservedStorage > 0 ? `Granary: +${cur.preservedStorage}` : null,
              cur.popCap > 0 ? `Pop: +${cur.popCap}` : null,
              cur.waterCap > 0 ? `Water: +${cur.waterCap}` : null,
              cur.seedVault > 0 ? `Vault: ${cur.seedVault}` : null,
              cur.maxAttachments > 0 ? `Attachments: ${cur.maxAttachments}` : null,
              cur.penCapacity > 0 ? `Pen Cap: ${cur.penCapacity}` : null,
              cur.productionPerDay > 0 ? `Output: +${cur.productionPerDay}/d` : null,
            ].filter(Boolean);

            return bonusParts.length > 0 ? (
              <p className="mt-2 font-mono text-[11px] text-emerald-300">
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
              {isUpgrading && activeBuildTask && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs"
                >
                  <div className="font-bold text-amber-300">
                    Upgrading... (Building remains active)
                  </div>
                  <div className="mt-1 font-mono text-slate-200">
                    Completion in:{' '}
                    {formatGameDuration(
                      (activeBuildTask.completedAtMs ?? state.virtualTimeMs) - state.virtualTimeMs,
                    )}
                  </div>
                  {activeBuildTask.returnsAtMs &&
                    activeBuildTask.returnsAtMs !== activeBuildTask.completedAtMs && (
                      <div className="mt-0.5 font-mono text-slate-400">
                        Builder returns to Main in:{' '}
                        {formatGameDuration(activeBuildTask.returnsAtMs - state.virtualTimeMs)}
                      </div>
                    )}
                </div>
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
                        const missingAnimals = Object.entries(u.requiredAnimal ?? {}).filter(
                          ([animalId, q]) => (state.animals?.[animalId] ?? 0) < q,
                        );
                        const hasAnimals = missingAnimals.length === 0;
                        const prosOk =
                          unitId !== 'prospector' || state.unlockedTechs.includes('bone_pickaxe');
                        const canTrain =
                          !isAbandoned && prosOk && hasAnimals && popUsed + u.popCost <= maxPop;
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
                                Pop: {u.popCost}
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
                                        .map(([a, q]) => `${q} ${a}`)
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
                      const prereqsOk = tech.prerequisites.every((p) =>
                        state.unlockedTechs.includes(p),
                      );
                      const triggerOk =
                        prereqsOk &&
                        isTechTriggerSatisfied(techId, {
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
                            <div className="mt-0.5 text-[11px] text-slate-300">
                              Cost: <CostInline cost={tech.cost} inventory={state.inventory} /> ·{' '}
                              {tech.researchTimeHours}h
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
                      const inputLimits = Object.entries(recipe.inputs).map(([id, q]) =>
                        q > 0 ? Math.floor((state.inventory[id] ?? 0) / q) : 999,
                      );
                      const waterLimit =
                        waterCost > 0 ? Math.floor((state.water ?? 0) / waterCost) : 999;
                      const maxCraftable = Math.max(
                        0,
                        Math.min(999, ...inputLimits, waterLimit),
                      );
                      const rawQty = craftQuantities[recipeId] ?? 1;
                      const selectedQty =
                        maxCraftable > 0
                          ? Math.max(1, Math.min(maxCraftable, Math.floor(rawQty) || 1))
                          : 1;
                      const canCraft = !isAbandoned && maxCraftable >= 1;

                      const scaledInputs = Object.fromEntries(
                        Object.entries(recipe.inputs).map(([id, q]) => [id, q * selectedQty]),
                      );
                      const scaledWater = waterCost * selectedQty;

                      return (
                        <div
                          key={recipeId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-100">
                              {recipe.name}
                              {recipe.unlocksTech && (
                                <span className="ml-2 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] capitalize text-orange-300">
                                  Unlocks {recipe.unlocksAge ?? recipe.unlocksTech} Age
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              <CostInline
                                cost={scaledInputs}
                                inventory={state.inventory}
                                waterCost={scaledWater}
                                currentWater={state.water ?? 0}
                              />{' '}
                              →{' '}
                              {Object.entries(recipe.outputs)
                                .map(([id, q]) => `${q * selectedQty} ${RESOURCES[id]?.name ?? id}`)
                                .join(', ')}{' '}
                              ({Math.round(recipe.craftTimeHours * selectedQty * 100) / 100}h)
                            </div>
                          </div>

                          <div className="flex items-center gap-1 font-mono text-[11px]">
                            <button
                              type="button"
                              aria-label={`Decrease quantity for ${recipe.name}`}
                              disabled={isAbandoned || selectedQty <= 1}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [recipeId]: Math.max(1, selectedQty - 1),
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
                              aria-label={`Quantity for ${recipe.name}`}
                              value={selectedQty}
                              onChange={(e) =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [recipeId]: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                                }))
                              }
                              className="w-12 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-center text-slate-100 disabled:opacity-40"
                            />
                            <button
                              type="button"
                              aria-label={`Increase quantity for ${recipe.name}`}
                              disabled={isAbandoned || selectedQty >= maxCraftable}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [recipeId]: Math.min(Math.max(1, maxCraftable), selectedQty + 1),
                                }))
                              }
                              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              aria-label={`Max quantity for ${recipe.name}`}
                              disabled={!canCraft}
                              onClick={() =>
                                setCraftQuantities((prev) => ({
                                  ...prev,
                                  [recipeId]: Math.max(1, maxCraftable),
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
                                  recipeId,
                                  quantity: selectedQty,
                                });
                                setCraftQuantities((prev) => ({ ...prev, [recipeId]: 1 }));
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

              {/* Active Crafting/Research Timers inside this building */}
              {activeCraftOrResearch.length > 0 && (
                <section className="rounded-lg border border-sky-800/60 bg-sky-950/30 p-2.5">
                  <div className="font-semibold text-sky-300">Active Work Queue</div>
                  {activeCraftOrResearch.map((t) => (
                    <div key={t.id} className="mt-1 flex justify-between font-mono text-[11px]">
                      <span>
                        {t.recipeId
                          ? `${t.quantity > 1 ? `${t.quantity}x ` : ''}${RECIPES[t.recipeId].name}`
                          : TECHNOLOGIES[t.techId].name}
                      </span>
                      <span>{formatGameDuration(t.completedAtMs - state.virtualTimeMs)}</span>
                    </div>
                  ))}
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
                      Advance Building to Tier {tierResetRule.targetTier} (Resets Lv 1)
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
              {building.level < def.maxLevel && (
                <section className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div>
                    <div className="font-semibold text-slate-100">Upgrade to Level {nextLevel}</div>
                    {upgradePreview?.nextLevel?.summary && (
                      <div className="text-[11px] font-medium text-emerald-300">
                        Improves: {upgradePreview.nextLevel.summary}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Cost: <CostInline cost={levelUpgradeCost} inventory={state.inventory} />
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
                              · {tierUpRule.buildTimeHours}h
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
            </div>
          )}
        </>
      ) : null}
    </dialog>
  );
}
