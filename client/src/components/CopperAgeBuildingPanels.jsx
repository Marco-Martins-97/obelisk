import { useState } from 'react';
import {
  BUILDINGS,
  CROPS,
  FERTILIZER_TO_NUTRIENT,
  LIVESTOCK,
  ORCHARD_TREES,
  RESOURCES,
  UNITS,
  calculateTierLevelValue,
  getBuildingDailyProduction,
  getBuildingUpgradePreview,
} from '@obelisk/shared';
import CostInline from './CostInline.jsx';
import { formatRealDurationHMS, formatRealHoursHMS } from '../utils/timeFormat.js';

/**
 * Renders specialized Stage 4 (Copper Age) building management controls inside BuildingModal:
 * - Main: City Wall builder/upgrade
 * - Extraction (Mine, Timber Camp, Quarry, Clay Pit, Well): Daily output rates & deposits left
 * - Farmstead: Seed Vault & attachment counter
 * - Crop Field: 8x8 slots, Soil Nutrients A/B/C, Plant / Fertilize / Harvest
 * - Orchard: 9 tree slots, age progress, Plant Saplings / Harvest Apples
 * - Animal Pen: Capacity & livestock species list
 * - Market: 1:1 Resource Trade swap
 *
 * @param {object} props
 * @returns {import('react').JSX.Element | null}
 */
export default function CopperAgeBuildingPanels({
  building,
  state,
  village,
  territory,
  freeUnits,
}) {
  const [seedAmt, setSeedAmt] = useState(10);
  const [selectedCrop, setSelectedCrop] = useState('grain');
  const [tradeGiveId, setTradeGiveId] = useState('sticks');
  const [tradeReceiveId, setTradeReceiveId] = useState('small_stones');
  const [tradeQty, setTradeQty] = useState(5);
  const [marketTab, setMarketTab] = useState('local');
  const [offerResId, setOfferResId] = useState('wood_logs');
  const [offerResQty, setOfferResQty] = useState(20);
  const [requestResId, setRequestResId] = useState('tin_ore');
  const [requestResQty, setRequestResQty] = useState(10);

  if (!building || building.status !== 'active') return null;

  const def = BUILDINGS[building.buildingId];
  const isAbandoned = Boolean(state.isAbandoned);
  const main = state.buildings.find((b) => b.buildingId === 'main') ?? building;
  const tile = territory?.tiles?.[building.y * (territory?.size ?? 25) + building.x];
  const coordKey = `${building.x},${building.y}`;
  const tileDetail = state.tileDetails?.[coordKey] ?? {};

  const tradeableIds = Object.keys(RESOURCES).filter((id) => RESOURCES[id]?.category !== 'livestock');

  // 1. Main City Wall card
  const renderWallSection = () => {
    if (building.buildingId !== 'main' || (main.tier ?? 1) < 2) return null;
    const wall = state.wall ?? { tier: 2, level: 0, status: 'none' };
    const wallDef = BUILDINGS.wall;
    const isConstructing = wall.status === 'constructing';
    const isResetTier = wall.level >= wallDef.maxLevel;
    const nextTier = isResetTier ? wall.tier + 1 : wall.tier;
    const nextLv = isResetTier ? 1 : wall.level + 1;
    const atCap = nextTier > (main.tier ?? 1) || nextTier > wallDef.maxTier;
    const wallCost = Object.fromEntries(
      Object.entries(wallDef.cost).map(([id, q]) => [id, q * nextTier * nextLv]),
    );
    const hasSpear = state.unlockedTechs.includes('stone_spear');
    const canAfford = Object.entries(wallCost).every(([id, q]) => (state.inventory[id] ?? 0) >= q);
    const canUpgradeWall =
      !isAbandoned && !isConstructing && hasSpear && !atCap && canAfford && freeUnits.builder >= 1;
    const wallPreview = getBuildingUpgradePreview({
      building: { buildingId: 'wall', tier: wall.tier, level: wall.level },
    });
    const wallNextSummary = isResetTier
      ? wallPreview.nextTier?.summary
      : wallPreview.nextLevel?.summary;

    return (
      <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-amber-200">
              City Wall {wall.level > 0 ? `(Tier ${wall.tier} Lv ${wall.level})` : '(Not Built)'}
            </h3>
            <p className="text-[11px] text-slate-400">
              Defense: {village.wallBonuses?.defensePercent ?? 0}% · Degradation Reduction:{' '}
              {village.wallBonuses?.defensePercent ?? 0}%
            </p>
            {wallNextSummary && !atCap && (
              <p className="text-[11px] font-medium text-emerald-300">
                Improves: {wallNextSummary}
              </p>
            )}
            {!hasSpear && (
              <p className="text-[11px] text-rose-400">Requires Stone Spear tech at Smithy.</p>
            )}
            {!isConstructing && !atCap && (
              <p className="text-[11px] text-slate-300">
                {wall.level === 0 ? 'Build' : `Upgrade -> T${nextTier} Lv ${nextLv}`}:{' '}
                <CostInline cost={wallCost} inventory={state.inventory} /> ·{' '}
                {formatRealHoursHMS(
                  wallDef.buildTimeHours,
                  village.effectiveSpeedFactor ?? state.speedFactor ?? 6,
                  state.efficiencyPenalty ?? 0,
                )}
              </p>
            )}
          </div>
          {isConstructing ? (
            <span className="rounded bg-amber-500/20 px-2 py-1 font-mono text-amber-300">
              Building...
            </span>
          ) : !atCap ? (
            <button
              type="button"
              disabled={!canUpgradeWall}
              onClick={() => village.startUpgradeWall()}
              className={`rounded px-2.5 py-1 font-semibold ${
                canUpgradeWall
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'cursor-not-allowed bg-slate-800 text-slate-500'
              }`}
            >
              {wall.level === 0 ? 'Build Wall' : 'Upgrade Wall'}
            </button>
          ) : (
            <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300">Maxed</span>
          )}
        </div>
      </section>
    );
  };

  // 2. Continuous Auto-Production readout (Mine, Timber Camp, Quarry, Clay Pit, Well)
  const renderProductionSection = () => {
    if (!def?.productionTierBases || !tile) return null;
    const streams = getBuildingDailyProduction({
      building,
      tile,
      tileDetail,
      territory,
      unlockedTechs: state.unlockedTechs,
      efficiencyPenalty: state.efficiencyPenalty ?? 0,
    });

    return (
      <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <h3 className="mb-1.5 font-semibold text-sky-300">Continuous Production (Per In-Game Day)</h3>
        {streams.length === 0 ? (
          <p className="text-[11px] text-rose-300">
            Production halted (deposit depleted or no active veins &gt;= 5%).
          </p>
        ) : (
          <ul className="space-y-1 font-mono text-[11px]">
            {streams.map((s) => (
              <li
                key={s.resourceId}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-2 py-1"
              >
                <span className="text-slate-200">{RESOURCES[s.resourceId]?.name ?? s.resourceId}</span>
                <span className="text-emerald-300">
                  +{s.ratePerDay}/day
                  {s.remaining !== null ? ` · ${s.remaining.toLocaleString()} left` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  // 3. Farmstead Seed Vault
  const renderFarmSection = () => {
    if (building.buildingId !== 'farm') return null;
    const seedCap = village.farmSeedCapacity ?? 128;
    const grainVault = state.seedReserve?.grain ?? 0;
    const rootsVault = state.seedReserve?.roots ?? 0;

    return (
      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lime-300">Farmstead Seed Vault</h3>
          <span className="font-mono text-[11px] text-slate-300">
            Vault: {grainVault + rootsVault}/{seedCap} · Attachments: {village.farmAttachmentsUsed}/
            {village.farmMaxAttachments}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          {['grain', 'roots'].map((itemId) => (
            <div key={itemId} className="rounded border border-slate-800 bg-slate-900 p-2">
              <div className="text-slate-200">
                {RESOURCES[itemId]?.name}: <strong>{state.seedReserve?.[itemId] ?? 0}</strong>{' '}
                (Stock: {state.inventory[itemId] ?? 0})
              </div>
              <button
                type="button"
                disabled={isAbandoned || (state.inventory[itemId] ?? 0) <= 0}
                onClick={() => village.depositSeedReserve({ itemId, amount: seedAmt })}
                className="mt-1.5 w-full rounded bg-lime-600 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-lime-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                Store +{seedAmt}
              </button>
            </div>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[11px] text-slate-400">
          Transfer Batch:
          <input
            type="number"
            min={1}
            max={64}
            value={seedAmt}
            onChange={(e) => setSeedAmt(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-100"
          />
        </label>
      </section>
    );
  };

  // 4. Crop Field (8x8 = 64 slots)
  const renderCropFieldSection = () => {
    if (building.buildingId !== 'crop_field') return null;
    const plot = tileDetail.cropPlot ?? {
      cropId: null,
      plantedSlots: 0,
      survivingSlots: 0,
      grownDays: 0,
      matureDays: 0,
      status: 'empty',
      nutrients: { A: 100, B: 100, C: 100 },
    };
    const crop = plot.cropId ? CROPS[plot.cropId] : null;
    const isSpring = village.calendar?.season === 'spring';

    const rawNutrients = plot.nutrients ?? {};
    const nutrients = {
      N: rawNutrients.N ?? rawNutrients.A ?? 100,
      P: rawNutrients.P ?? rawNutrients.B ?? 100,
      K: rawNutrients.K ?? rawNutrients.C ?? 100,
    };

    return (
      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lime-300">Crop Field (8×8 = 64 Slots)</h3>
          <span className="font-mono text-[11px] uppercase text-amber-300">{plot.status}</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          {[
            { key: 'N', title: 'Nitrogen (N)' },
            { key: 'P', title: 'Phosphorus (P)' },
            { key: 'K', title: 'Potassium (K)' },
          ].map(({ key, title }) => (
            <div key={key} className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-center">
              {title}: <strong className="text-emerald-300">{Math.round(nutrients[key])}%</strong>
            </div>
          ))}
        </div>

        {crop && plot.status !== 'empty' && (
          <div className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 font-mono text-[11px]">
            <div>
              {crop.name} ({plot.survivingSlots}/{plot.plantedSlots} alive) · Safe: {crop.minTempC}..
              {crop.maxTempC}°C
            </div>
            <div className="text-slate-400">
              Growth: {plot.grownDays}/{crop.growthDays}d
              {plot.status === 'ready' ? ` · Spoil Window: ${plot.matureDays}/${crop.harvestWindowDays}d` : ''}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {plot.status === 'empty' && (
            <>
              <select
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              >
                {Object.values(CROPS).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Nut {c.nutrientType}, {c.minTempC}..{c.maxTempC}°C)
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={isAbandoned || !isSpring}
                onClick={() =>
                  village.plantCropPlotAction({ x: building.x, y: building.y, cropId: selectedCrop })
                }
                className="rounded bg-lime-600 px-2.5 py-1 font-semibold text-slate-950 hover:bg-lime-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                {isSpring ? 'Plant Field (up to 64)' : 'Plant in Spring Only'}
              </button>
            </>
          )}

          {plot.status === 'ready' && (
            <button
              type="button"
              disabled={isAbandoned}
              onClick={() => village.harvestCropPlotAction({ x: building.x, y: building.y })}
              className="rounded bg-amber-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-amber-400"
            >
              Harvest Crop
            </button>
          )}

          {Object.entries(FERTILIZER_TO_NUTRIENT).map(([itemId, nKey]) => (
            <button
              key={itemId}
              type="button"
              disabled={isAbandoned || (state.inventory[itemId] ?? 0) < 1}
              onClick={() =>
                village.fertilizeCropPlotAction({ x: building.x, y: building.y, itemId })
              }
              className="rounded border border-emerald-700 bg-emerald-950/60 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +{nKey} {RESOURCES[itemId]?.name ?? itemId} ({state.inventory[itemId] ?? 0})
            </button>
          ))}
        </div>
      </section>
    );
  };

  // 5. Orchard (9 tree slots)
  const renderOrchardSection = () => {
    if (building.buildingId !== 'orchard') return null;
    const plot = tileDetail.orchardPlot ?? {
      treeId: 'apple_tree',
      plantedSlots: 0,
      survivingSlots: 0,
      grownDays: 0,
      lastHarvestYear: 0,
    };
    const tree = ORCHARD_TREES[plot.treeId] ?? ORCHARD_TREES.apple_tree;
    const season = village.calendar?.season;
    const canHarvest =
      plot.survivingSlots > 0 &&
      plot.grownDays >= tree.matureDays &&
      tree.harvestSeasons.includes(season) &&
      plot.lastHarvestYear < (village.calendar?.year ?? 1);

    return (
      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <h3 className="font-semibold text-emerald-300">Orchard (9 Tree Slots)</h3>
        <div className="font-mono text-[11px] text-slate-300">
          {tree.name}: {plot.survivingSlots}/9 trees · Age: {plot.grownDays}/{tree.matureDays}d (1 yr mature)
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isAbandoned || plot.survivingSlots >= 9 || (state.inventory.sapling ?? 0) <= 0}
            onClick={() => village.plantOrchardAction({ x: building.x, y: building.y })}
            className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            Plant Saplings ({state.inventory.sapling ?? 0} avail)
          </button>
          <button
            type="button"
            disabled={isAbandoned || !canHarvest}
            onClick={() => village.harvestOrchardAction({ x: building.x, y: building.y })}
            className="rounded bg-amber-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            Harvest Apples (Summer/Autumn)
          </button>
        </div>
      </section>
    );
  };

  // 6. Animal Pen overview
  const renderAnimalPenSection = () => {
    if (building.buildingId !== 'animal_pen') return null;
    const cap = calculateTierLevelValue(
      def.penCapacityTierBases,
      building.tier ?? def.tier,
      building.level ?? 1,
      def.maxLevel,
    );
    const animals = state.animals ?? {};
    const total = Object.values(animals).reduce((s, q) => s + q, 0);

    return (
      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-amber-200">Animal Pen Livestock</h3>
          <span className="font-mono text-[11px] text-slate-300">
            Total: {total}/{village.animalPenCapacity ?? cap} (Pen +{cap} cap)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          {Object.values(LIVESTOCK).map((spec) => {
            const count = animals[spec.id] ?? 0;
            const slaughterText = Object.entries(spec.slaughterYield ?? {})
              .map(([id, q]) => `+${q} ${RESOURCES[id]?.name ?? id}`)
              .join(', ');
            return (
              <div key={spec.id} className="rounded border border-slate-800 bg-slate-900 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 text-slate-100">
                  <span>
                    {spec.name}: <strong>{count}</strong>
                  </span>
                  <button
                    type="button"
                    aria-label={`Kill 1 ${spec.name}`}
                    disabled={isAbandoned || count < 1}
                    onClick={() => village.slaughterAnimal({ animalId: spec.id, count: 1 })}
                    className="rounded border border-rose-700/70 bg-rose-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Kill -1
                  </button>
                </div>
                <div className="text-[10px] text-slate-400">
                  Daily: +1 Manure{spec.dailyOutputId ? `, +1 ${RESOURCES[spec.dailyOutputId]?.name}` : ''}
                </div>
                <div className="text-[10px] text-slate-500">Slaughter: {slaughterText}</div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  // 7. Market (1 Building, 2 Tabs: Local Barter 1:1 + Regional Caravan Trade in Sandbox)
  const renderMarketSection = () => {
    if (building.buildingId !== 'market') return null;
    const availGive = state.inventory[tradeGiveId] ?? 0;
    const validTrade =
      !isAbandoned &&
      tradeGiveId !== tradeReceiveId &&
      tradeQty > 0 &&
      availGive >= tradeQty;

    const regionalEnabled = Boolean(village.createMarketOffer);
    const activeSpeed = village.effectiveSpeedFactor ?? state.speedFactor ?? 6;
    const offers = village.marketOffers ?? [];
    const offerUnitBulk = RESOURCES[offerResId]?.sizeClass ?? 2;
    const caravansNeeded = Math.max(
      1,
      Math.ceil((Math.max(1, offerResQty) * offerUnitBulk) / (UNITS.caravan?.carryCapacity ?? 150)),
    );
    const freeCaravans = freeUnits?.caravan ?? 0;
    const validOffer =
      regionalEnabled &&
      !isAbandoned &&
      offerResId !== requestResId &&
      offerResQty > 0 &&
      requestResQty > 0 &&
      (state.inventory[offerResId] ?? 0) >= offerResQty &&
      freeCaravans >= caravansNeeded;

    return (
      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-violet-300">Market Exchange</h3>
          <div className="inline-flex rounded border border-slate-700 bg-slate-900 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMarketTab('local')}
              className={`rounded px-2 py-0.5 font-medium ${
                marketTab === 'local'
                  ? 'bg-violet-500 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Local Barter (1:1)
            </button>
            <button
              type="button"
              onClick={() => setMarketTab('regional')}
              className={`rounded px-2 py-0.5 font-medium ${
                marketTab === 'regional'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Regional Caravan Trade
            </button>
          </div>
        </div>

        {marketTab === 'local' ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <input
              type="number"
              min={1}
              max={Math.max(1, availGive)}
              value={tradeQty}
              onChange={(e) => setTradeQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-100"
            />
            <select
              value={tradeGiveId}
              onChange={(e) => setTradeGiveId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
            >
              {tradeableIds.map((id) => (
                <option key={id} value={id}>
                  Give {RESOURCES[id].name} ({state.inventory[id] ?? 0})
                </option>
              ))}
            </select>
            <span className="text-slate-400">→</span>
            <select
              value={tradeReceiveId}
              onChange={(e) => setTradeReceiveId(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
            >
              {tradeableIds.map((id) => (
                <option key={id} value={id}>
                  Get {RESOURCES[id].name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!validTrade}
              onClick={() =>
                village.tradeMarketResources({
                  giveId: tradeGiveId,
                  giveQty: tradeQty,
                  receiveId: tradeReceiveId,
                })
              }
              className="rounded bg-violet-500 px-2.5 py-1 font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              Trade 1:1
            </button>
          </div>
        ) : !regionalEnabled ? (
          <p className="text-[11px] text-slate-400">
            Regional Caravan Trade requires multiple active territories (available in Sandbox mode or
            after multiplayer API launch).
          </p>
        ) : (
          <div className="space-y-3 text-[11px]">
            <div className="space-y-2 rounded border border-slate-800 bg-slate-900/90 p-2.5">
              <div className="flex items-center justify-between text-amber-200">
                <span className="font-semibold">Post Inter-Territory Trade Offer</span>
                <span className="font-mono text-slate-300">
                  Free Caravans: {freeCaravans} (Needs {caravansNeeded})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  aria-label="Offer quantity"
                  value={offerResQty}
                  onChange={(e) => setOfferResQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                />
                <select
                  aria-label="Offer resource"
                  value={offerResId}
                  onChange={(e) => setOfferResId(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                >
                  {tradeableIds.map((id) => (
                    <option key={id} value={id}>
                      Offer {RESOURCES[id].name} ({state.inventory[id] ?? 0})
                    </option>
                  ))}
                </select>
                <span className="text-slate-400">for</span>
                <input
                  type="number"
                  min={1}
                  aria-label="Request quantity"
                  value={requestResQty}
                  onChange={(e) => setRequestResQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-100"
                />
                <select
                  aria-label="Request resource"
                  value={requestResId}
                  onChange={(e) => setRequestResId(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                >
                  {tradeableIds.map((id) => (
                    <option key={id} value={id}>
                      Want {RESOURCES[id].name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!validOffer}
                  onClick={() =>
                    village.createMarketOffer({
                      offerId: offerResId,
                      offerQty: offerResQty,
                      requestId: requestResId,
                      requestQty: requestResQty,
                    })
                  }
                  className="rounded bg-amber-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                >
                  Create Offer
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="font-semibold text-slate-300">Open &amp; Active Trade Caravans</div>
              {offers.filter((o) => o.status !== 'completed').length === 0 ? (
                <p className="text-slate-500">No active regional offers yet.</p>
              ) : (
                offers
                  .filter((o) => o.status !== 'completed')
                  .map((offer) => {
                    const isOwn = `${offer.sellerCoords.x},${offer.sellerCoords.y}` === state.spawnKey;
                    const canAccept =
                      !isOwn &&
                      offer.status === 'open' &&
                      !isAbandoned &&
                      (state.inventory[offer.requestId] ?? 0) >= offer.requestQty;
                    const offerName = RESOURCES[offer.offerId]?.name ?? offer.offerId;
                    const reqName = RESOURCES[offer.requestId]?.name ?? offer.requestId;
                    const phaseLabel =
                      offer.status === 'open'
                        ? 'Open Escrow'
                        : offer.buyerDelivered
                          ? `Returning to (${offer.sellerCoords.x},${offer.sellerCoords.y}): ${formatRealDurationHMS(offer.returnsAtMs - state.virtualTimeMs, activeSpeed)}`
                          : `Traveling to (${offer.buyerCoords.x},${offer.buyerCoords.y}): ${formatRealDurationHMS(offer.arrivesAtMs - state.virtualTimeMs, activeSpeed)}`;

                    return (
                      <div
                        key={offer.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-2"
                      >
                        <div>
                          <div className="font-medium text-slate-100">
                            ({offer.sellerCoords.x},{offer.sellerCoords.y}): {offer.offerQty}{' '}
                            {offerName} → {offer.requestQty} {reqName}
                          </div>
                          <div className="font-mono text-[10px] text-amber-300">{phaseLabel}</div>
                        </div>
                        {offer.status === 'open' && isOwn && (
                          <button
                            type="button"
                            onClick={() => village.cancelMarketOffer(offer.id)}
                            className="rounded border border-rose-700/70 bg-rose-950/60 px-2 py-1 text-rose-200 hover:bg-rose-900/70"
                          >
                            Cancel
                          </button>
                        )}
                        {offer.status === 'open' && !isOwn && (
                          <button
                            type="button"
                            disabled={!canAccept}
                            onClick={() => village.acceptMarketOffer(offer.id)}
                            className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                          >
                            Accept Offer
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      {renderWallSection()}
      {renderProductionSection()}
      {renderFarmSection()}
      {renderCropFieldSection()}
      {renderOrchardSection()}
      {renderAnimalPenSection()}
      {renderMarketSection()}
    </>
  );
}
