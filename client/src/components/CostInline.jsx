import { RESOURCES } from '@obelisk/shared';

/**
 * Renders a comma-separated resource cost breakdown where missing items (or missing water bowls)
 * are highlighted in red (`text-rose-400`) while sufficient entries stay neutral.
 *
 * @param {object} props
 * @param {Record<string, number>} [props.cost={}] - Required resource quantities keyed by resourceId.
 * @param {Record<string, number>} [props.inventory={}] - Available player stockpile counts.
 * @param {number} [props.waterCost=0] - Optional water bowls required (crafting recipes).
 * @param {number} [props.currentWater=0] - Available village water bowls.
 * @returns {import('react').JSX.Element} Inline formatted cost breakdown.
 */
export default function CostInline({
  cost = {},
  inventory = {},
  waterCost = 0,
  currentWater = 0,
}) {
  const entries = Object.entries(cost ?? {}).map(([id, qty]) => ({
    id,
    qty,
    name: RESOURCES[id]?.name ?? id,
    have: inventory[id] ?? 0,
  }));

  if (waterCost > 0) {
    entries.push({
      id: 'water',
      qty: waterCost,
      name: 'Water Bowls',
      have: currentWater,
    });
  }

  if (entries.length === 0) {
    return <span className="text-slate-300">Free</span>;
  }

  return (
    <>
      {entries.map((entry, idx) => {
        const isMissing = entry.have < entry.qty;
        return (
          <span key={entry.id}>
            {idx > 0 ? ', ' : ''}
            <span className={isMissing ? 'font-semibold text-rose-400' : 'text-slate-300'}>
              {entry.qty} {entry.name}
            </span>
          </span>
        );
      })}
    </>
  );
}
