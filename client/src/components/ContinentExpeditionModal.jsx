import { useEffect, useId, useRef, useState } from 'react';
import {
  COLONY_STARTER_COST,
  calculateColonizationPlan,
  calculateConquerAbandonedPlan,
  calculateContinentExpeditionPlan,
} from '@obelisk/shared';
import CostInline from './CostInline.jsx';
import { formatRealDurationHMS } from '../utils/timeFormat.js';

const EXPEDITION_ROLES = [
  { id: 'scout', label: 'Scout (Horse, 10 km/h, reveals 3×3)' },
  { id: 'caravan', label: 'Caravan (Donkey, 150 bulk loot haul)' },
  { id: 'wagon', label: 'Heavy Wagon (2 Donkeys, 400 bulk haul)' },
  { id: 'prospector', label: 'Prospector (Surveys rock & ores)' },
  { id: 'builder', label: 'Builder (Required to colonize)' },
  { id: 'gatherer', label: 'Gatherer (Collects stone & wood)' },
  { id: 'hunter', label: 'Hunter (Hunts meat, pelts & animals)' },
  { id: 'spearman', label: 'Spearman (Escort Guard)' },
  { id: 'swordsman', label: 'Swordsman (Heavy Escort)' },
  { id: 'archer', label: 'Archer (Ranged Escort)' },
  { id: 'cavalry', label: 'Cavalry (10 km/h Mounted Escort + 3×3)' },
  { id: 'knight', label: 'Knight (Lord; consumed to conquer Abandoned)' },
  { id: 'fishing_boat', label: 'Fishing Boat (60 bulk water haul)' },
  { id: 'transport_ship', label: 'Transport Ship (400 bulk cargo haul)' },
  { id: 'merchant_ship', label: 'Merchant Ship (1,000 bulk galleon)' },
];

const INITIAL_SELECTION = {
  scout: 0,
  caravan: 0,
  wagon: 0,
  prospector: 0,
  builder: 0,
  gatherer: 0,
  hunter: 0,
  spearman: 0,
  swordsman: 0,
  archer: 0,
  cavalry: 0,
  knight: 0,
  fishing_boat: 0,
  transport_ship: 0,
  merchant_ship: 0,
};

/**
 * Continent Map right-click expedition planner modal (`Explore / Loot Ruins`, `Colonize`, `Conquer Abandoned`).
 *
 * @param {object} props
 * @returns {import('react').JSX.Element | null}
 */
export default function ContinentExpeditionModal({
  targetTile,
  spawnTile,
  village,
  ownedTerritories = [],
  abandonedCoords = [],
  abandonedTiers = {},
  onClose,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [unitSelection, setUnitSelection] = useState(INITIAL_SELECTION);
  const [missionType, setMissionType] = useState('explore');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (targetTile && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!targetTile && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    return undefined;
  }, [targetTile]);

  if (!targetTile) {
    return (
      <dialog ref={dialogRef} onClose={onClose} className="hidden" />
    );
  }

  const { state, freeUnits, storedFood, effectiveSpeedFactor } = village;
  const hasOutpost = state.buildings.some(
    (b) => b.buildingId === 'expedition_outpost' && b.status === 'active',
  );
  const intel = state.discoveredContinentTiles?.[`${targetTile.x},${targetTile.y}`];
  const distTiles = Math.hypot(targetTile.x - spawnTile.x, targetTile.y - spawnTile.y);
  const selectedTotal = Object.values(unitSelection).reduce((s, q) => s + q, 0);
  const coordKey = `${targetTile.x},${targetTile.y}`;
  const isAbandonedTarget = (abandonedCoords ?? []).some((a) => `${a.x},${a.y}` === coordKey);
  const isOwnedTarget = (ownedTerritories ?? []).some((t) => `${t.x},${t.y}` === coordKey);
  const canColonizeTile = Boolean(targetTile.buildable) && !targetTile.isObelisk && !isOwnedTarget && !isAbandonedTarget;
  const abandonedMainTier = abandonedTiers?.[coordKey] ?? 2;

  const activeMission =
    missionType === 'conquer_abandoned' && !isAbandonedTarget
      ? 'explore'
      : missionType === 'colonize' && !canColonizeTile
        ? 'explore'
        : missionType;

  let plan = null;
  let missionCheck = null;
  if (selectedTotal > 0) {
    if (activeMission === 'colonize') {
      missionCheck = calculateColonizationPlan({
        from: spawnTile,
        to: targetTile,
        targetTile,
        units: unitSelection,
        inventory: state.inventory,
        storedFood,
        water: state.water ?? 0,
        ownedCoords: ownedTerritories,
        abandonedCoords,
        nowMs: state.virtualTimeMs,
        efficiencyPenalty: state.efficiencyPenalty ?? 0,
      });
      plan = missionCheck.plan;
    } else if (activeMission === 'conquer_abandoned') {
      missionCheck = calculateConquerAbandonedPlan({
        from: spawnTile,
        to: targetTile,
        units: unitSelection,
        abandonedMainTier,
        unitTiers: state.unitTiers ?? {},
        storedFood,
        water: state.water ?? 0,
        nowMs: state.virtualTimeMs,
        efficiencyPenalty: state.efficiencyPenalty ?? 0,
      });
      plan = missionCheck.plan;
    } else {
      plan = calculateContinentExpeditionPlan({
        from: spawnTile,
        to: targetTile,
        units: unitSelection,
        nowMs: state.virtualTimeMs,
        efficiencyPenalty: state.efficiencyPenalty ?? 0,
      });
    }
  }

  const canSend =
    Boolean(plan) &&
    hasOutpost &&
    !state.isAbandoned &&
    storedFood >= plan.foodNeeded &&
    (state.water ?? 0) >= plan.waterNeeded &&
    (activeMission === 'explore' || Boolean(missionCheck?.allowed));

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 text-xs text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div>
          <h2 id={titleId} className="text-base font-bold text-cyan-300">
            Continent Expedition · ({targetTile.x}, {targetTile.y})
          </h2>
          <p className="font-mono text-[11px] text-slate-400">
            Distance: {distTiles.toFixed(1)} Continent tiles ({Math.round(distTiles * 25)} Territory sub-tiles ·{' '}
            {(distTiles * 12.5).toFixed(1)} km)
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {targetTile.isRuin && (
          <div className="rounded border border-purple-700/70 bg-purple-950/40 p-2 text-[11px] text-purple-200">
            <strong>Ancient Ruins:</strong> Repeatable treasure raids + chance to recover undiscovered Blueprints ({(state.unlockedBlueprints ?? []).length}/3 found).
          </div>
        )}

        {isAbandonedTarget && (
          <div className="rounded border border-rose-700/70 bg-rose-950/40 p-2 text-[11px] text-rose-200">
            <strong>Abandoned Village (Tier {abandonedMainTier}):</strong> Occupied by Bandits (Defense {abandonedMainTier * 40}). Send troops + 1 Knight to conquer &amp; revive.
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMissionType('explore')}
            className={`rounded border px-2.5 py-1 font-semibold ${
              activeMission === 'explore'
                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            {targetTile.isRuin ? 'Explore / Loot Ruins' : 'Explore / Raid'}
          </button>
          {canColonizeTile && (
            <button
              type="button"
              onClick={() => setMissionType('colonize')}
              className={`rounded border px-2.5 py-1 font-semibold ${
                activeMission === 'colonize'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              Colonize Settlement
            </button>
          )}
          {isAbandonedTarget && (
            <button
              type="button"
              onClick={() => setMissionType('conquer_abandoned')}
              className={`rounded border px-2.5 py-1 font-semibold ${
                activeMission === 'conquer_abandoned'
                  ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                  : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200'
              }`}
            >
              Conquer Abandoned
            </button>
          )}
        </div>

        {intel && (
          <div className="rounded border border-emerald-800/70 bg-emerald-950/30 p-2 font-mono text-[11px]">
            <strong className="text-emerald-300">Surveyed Intel:</strong> Biome: {intel.biome} · Rock:{' '}
            {intel.rockType} · Ores: {intel.availableOres.join(', ')}
          </div>
        )}

        {!hasOutpost && (
          <div className="rounded border border-rose-700/70 bg-rose-950/40 p-2 text-rose-200">
            Build an <strong>Expedition Outpost</strong> (Stone Hammer tech) in your Territory first.
          </div>
        )}

        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {EXPEDITION_ROLES.map((role) => {
            const avail = freeUnits[role.id] ?? 0;
            const val = unitSelection[role.id] ?? 0;
            return (
              <div
                key={role.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5"
              >
                <span className="text-slate-200">
                  {role.label} <span className="text-slate-400">({avail} free)</span>
                </span>
                <div className="flex items-center gap-1 font-mono">
                  <button
                    type="button"
                    disabled={val <= 0}
                    onClick={() => setUnitSelection((p) => ({ ...p, [role.id]: Math.max(0, p[role.id] - 1) }))}
                    className="rounded border border-slate-700 px-1.5 py-0.5 hover:bg-slate-800 disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{val}</span>
                  <button
                    type="button"
                    disabled={val >= avail}
                    onClick={() => setUnitSelection((p) => ({ ...p, [role.id]: Math.min(avail, p[role.id] + 1) }))}
                    className="rounded border border-slate-700 px-1.5 py-0.5 hover:bg-slate-800 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {activeMission === 'colonize' && (
          <div className="rounded border border-emerald-800/60 bg-emerald-950/20 p-2 text-[11px] text-slate-200">
            <div>
              <strong>Starter Supplies:</strong> <CostInline cost={COLONY_STARTER_COST} inventory={state.inventory} />
            </div>
            <div className="text-slate-400">
              Requires 1 Builder (returns home), transport carry capacity, and 2× Food/Water. New Colony starts at Copper Age (Tier 2).
            </div>
          </div>
        )}

        {plan && (
          <div className="rounded border border-slate-800 bg-slate-950/90 p-2.5 font-mono text-[11px] space-y-1">
            <div>
              Rations Needed:{' '}
              <strong className={storedFood >= plan.foodNeeded ? 'text-emerald-300' : 'text-rose-400'}>
                {plan.foodNeeded} Food
              </strong>{' '}
              (have {Math.floor(storedFood)}) ·{' '}
              <strong className={(state.water ?? 0) >= plan.waterNeeded ? 'text-sky-300' : 'text-rose-400'}>
                {plan.waterNeeded} Water
              </strong>{' '}
              (have {state.water})
            </div>
            <div>
              Round-Trip ETA: <strong className="text-amber-300">{formatRealDurationHMS(plan.returnsAtMs - state.virtualTimeMs, effectiveSpeedFactor)}</strong> ·
              Carry Cap: <strong>{plan.carryCapacity}</strong> bulk
            </div>
            {activeMission === 'conquer_abandoned' && missionCheck && (
              <div>
                Squad Attack: <strong className={missionCheck.combatAttack >= missionCheck.banditPower ? 'text-emerald-300' : 'text-rose-400'}>{missionCheck.combatAttack}</strong> vs Bandits <strong>{missionCheck.banditPower}</strong>
              </div>
            )}
            {missionCheck && !missionCheck.allowed && missionCheck.reason && (
              <div className="text-rose-400">{missionCheck.reason}</div>
            )}
            {activeMission === 'explore' && plan.carryCapacity === 0 && (
              <div className="text-amber-300">
                No Caravan/Wagon/Ship assigned: expedition will return with tile intel/fog only (no resources hauled).
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!canSend}
          onClick={() => {
            village.dispatchContinentExpedition({
              toX: targetTile.x,
              toY: targetTile.y,
              units: unitSelection,
              missionType: activeMission,
              abandonedMainTier,
            });
            onClose();
          }}
          className="w-full rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          {activeMission === 'colonize'
            ? 'Send Colonization Expedition'
            : activeMission === 'conquer_abandoned'
              ? 'Send Conquest Assault'
              : 'Send Expedition'}
        </button>
      </div>
    </dialog>
  );
}
