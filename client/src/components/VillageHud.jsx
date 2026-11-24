import { useState } from 'react';
import {
  AGES,
  BUILDINGS,
  RECIPES,
  RESOURCES,
  TECHNOLOGIES,
  UNITS,
  getTaskPhase,
} from '@obelisk/shared';
import { formatGameDurationHMS } from '../utils/timeFormat.js';

const PHASE_BADGE_STYLES = {
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
 * Sticky village resource & Age status bar rendered right below the TopNavbar
 * (or below MapControls on the Sandbox page).
 *
 * @param {object} props
 * @param {object} props.village
 * @param {{ x: number, y: number } | null} [props.spawnTile]
 * @param {(building: object) => void} props.onOpenBuilding
 * @returns {import('react').JSX.Element}
 */
export function VillageHeaderBar({ village, spawnTile, onOpenBuilding }) {
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
            <span className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-300">
              World ({spawnTile.x}, {spawnTile.y})
            </span>
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
          <button
            type="button"
            onClick={() => mainBuilding && onOpenBuilding(mainBuilding)}
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-slate-200 hover:bg-slate-800"
          >
            Open Main Hall
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="text-slate-200">
            Storage:{' '}
            <strong className="text-amber-300">
              {storageUsed}/{storageCapacity}
            </strong>
          </span>
          <span className="text-slate-200">
            Food: <strong className="text-emerald-300">{formattedFood}</strong>
          </span>
          <span className="text-slate-200">
            Water:{' '}
            <strong className="text-sky-300">
              {state.water}/{waterCapacity}
            </strong>
          </span>
          <span className="text-slate-200">
            Pop:{' '}
            <strong className="text-purple-300">
              {popUsed}/{maxPop}
            </strong>
          </span>
        </div>
      </div>

      {state.isAbandoned && (
        <div
          role="alert"
          className="mx-auto mt-2 max-w-7xl rounded border border-red-700/80 bg-red-950/75 px-3 py-1.5 text-[11px] text-red-200"
        >
          <strong>Abandoned Village:</strong> Maximum population fell to 0 after prolonged famine or
          dehydration. Click <strong>Reset Village</strong> to start a fresh settlement.
        </div>
      )}
    </section>
  );
}

/**
 * Right-sidebar stack of 4 separate village containers rendered below the Continent map:
 * 1) Active Timers (Going / Doing / Returning)
 * 2) Units
 * 3) Stockpile (with Eat + custom quantity Remove controls)
 * 4) Unlocked Technologies
 *
 * @param {object} props
 * @param {object} props.village
 * @returns {import('react').JSX.Element}
 */
export function VillageSidebarPanels({ village }) {
  const { state, freeUnits, removeResource } = village;
  const [discardAmounts, setDiscardAmounts] = useState({});

  const inventoryItems = Object.entries(state.inventory).filter(([, qty]) => qty > 0);

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* 1. Active Timers */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Active Timers ({state.tasks.length})
        </h3>
        {state.tasks.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Right-click any explored Territory tile to send units or build.
          </p>
        ) : (
          <ul className="space-y-1.5 font-mono text-[11px]">
            {state.tasks.map((t) => {
              const phaseInfo = getTaskPhase(t, state.virtualTimeMs);
              const markerKey =
                t.kind === 'unit_action'
                  ? (t.teamType ?? 'gatherer')
                  : t.kind === 'build' || t.kind === 'upgrade' || t.kind === 'upgrade_main'
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

              const coordsLabel =
                typeof t.x === 'number' && typeof t.y === 'number'
                  ? `(${t.x}, ${t.y})`
                  : 'Main Hall';

              const rightLabel =
                t.kind === 'unit_action'
                  ? `Team (${teamTag})`
                  : t.kind === 'build'
                    ? `Build ${BUILDINGS[t.buildingId].name}`
                    : t.kind === 'upgrade_main'
                      ? `Main -> Tier ${t.targetTier}`
                      : t.kind === 'upgrade'
                        ? `Upgrade ${BUILDINGS[t.buildingId].name}`
                        : t.kind === 'research'
                          ? `Research ${TECHNOLOGIES[t.techId].name}`
                          : `Craft ${RECIPES[t.recipeId].name}`;

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
                      Conclusion: {formatGameDurationHMS(phaseInfo.totalRemainingMs)}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                        PHASE_BADGE_STYLES[phaseInfo.phase]
                      }`}
                    >
                      {phaseInfo.phaseLabel} {formatGameDurationHMS(phaseInfo.phaseRemainingMs)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2. Units */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Units (Free / Total)
        </h3>
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          {Object.keys(UNITS).map((unitId) => (
            <div
              key={unitId}
              className="rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-center"
            >
              <div className="text-[10px] text-slate-400">{UNITS[unitId].name}</div>
              <div className="font-bold text-emerald-300">
                {freeUnits[unitId]}/{state.units[unitId] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Stockpile */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Stockpile ({inventoryItems.length} types)
        </h3>
        {inventoryItems.length === 0 ? (
          <p className="text-[11px] text-slate-500">Storage empty.</p>
        ) : (
          <ul className="space-y-1.5 font-mono text-[11px]">
            {inventoryItems.map(([id, qty]) => {
              const res = RESOURCES[id];
              const rawAmt = discardAmounts[id] ?? 1;
              const clampedAmt = Math.max(1, Math.min(qty, rawAmt));

              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2 py-1.5 text-slate-200"
                >
                  <div className="flex flex-col">
                    <span>
                      {res?.name ?? id}: <strong>{qty}</strong>
                    </span>
                    {(res?.edible || res?.spoilRatePerDay > 0) && (
                      <span className="text-[10px] text-slate-400">
                        {res?.edible ? `+${res.foodValue} food` : 'Raw'}
                        {res?.spoilRatePerDay > 0
                          ? ` · -${Math.round(res.spoilRatePerDay * 100)}%/d spoil`
                          : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={qty}
                      disabled={Boolean(state.isAbandoned)}
                      value={clampedAmt}
                      aria-label={`Remove amount for ${res?.name ?? id}`}
                      onChange={(e) =>
                        setDiscardAmounts((prev) => ({
                          ...prev,
                          [id]: Number(e.target.value) || 1,
                        }))
                      }
                      className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-center text-[10px] text-slate-100 disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={Boolean(state.isAbandoned)}
                      aria-label={`Remove ${res?.name ?? id}`}
                      onClick={() => {
                        removeResource(id, clampedAmt);
                        setDiscardAmounts((prev) => ({ ...prev, [id]: 1 }));
                      }}
                      className="rounded border border-rose-700/70 bg-rose-950/60 px-1.5 py-0.5 text-[10px] text-rose-200 hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 4. Unlocked Technologies */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          Unlocked Technologies
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {state.unlockedTechs.map((techId) => (
            <span
              key={techId}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
            >
              {TECHNOLOGIES[techId]?.name ?? techId}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Full-width Village Log card anchored cleanly at the bottom of the page.
 *
 * @param {object} props
 * @param {string[]} props.logs
 * @returns {import('react').JSX.Element}
 */
export function VillageLogFooter({ logs }) {
  return (
    <section
      aria-label="Village activity log"
      className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 text-xs"
    >
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
        Village Log
      </h3>
      <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-300">
        {logs.map((entry, idx) => (
          <li key={`${idx}-${entry.slice(0, 14)}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}
