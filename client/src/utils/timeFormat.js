import { REAL_MS_PER_INGAME_HOUR, RESOURCES } from '@obelisk/shared';

const MS_PER_INGAME_MINUTE = REAL_MS_PER_INGAME_HOUR / 60;
const MS_PER_INGAME_SECOND = REAL_MS_PER_INGAME_HOUR / 3600;

/**
 * Formats an in-game virtual duration (ms at baseline 6x scale) into human-readable hours/minutes.
 *
 * @param {number} remainingMs - Remaining virtual milliseconds.
 * @returns {string} Compact formatted duration (e.g., "1h 25m", "12m", "< 1m").
 */
export function formatGameDuration(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Done';
  const totalMinutes = Math.ceil(remainingMs / MS_PER_INGAME_MINUTE);
  if (totalMinutes < 1) return '< 1m';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Formats an in-game virtual duration as `HH:MM:SS` (`h:m:s`) for live Active Timers.
 *
 * @param {number} remainingMs - Remaining virtual milliseconds.
 * @returns {string} Zero-padded `HH:MM:SS` duration string.
 */
export function formatGameDurationHMS(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '00:00:00';
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / MS_PER_INGAME_SECOND));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Converts virtual remaining time (stored at 6x scale) into real wall-clock remaining `HH:MM:SS`.
 * Example: 12 in-game minutes at 6x equals 2 real minutes (`00:02:00`).
 *
 * @param {number} virtualRemainingMs - Remaining virtual milliseconds.
 * @param {number} [speedFactor=6] - Active simulation speed multiplier.
 * @returns {string} Zero-padded real-time `HH:MM:SS` remaining duration.
 */
export function formatRealDurationHMS(virtualRemainingMs, speedFactor = 6) {
  if (!Number.isFinite(virtualRemainingMs) || virtualRemainingMs <= 0) return '00:00:00';
  const safeSpeed = Number.isFinite(speedFactor) && speedFactor > 0 ? speedFactor : 6;
  const realMs = (virtualRemainingMs * 6) / safeSpeed;
  const totalSeconds = Math.max(0, Math.ceil(realMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Converts a recipe, tech, or construction duration in in-game hours (at baseline 6x scale
 * and active starvation efficiency penalty) into a real wall-clock `HH:MM:SS` duration string.
 *
 * @param {number} inGameHours - Duration specified in in-game hours.
 * @param {number} [speedFactor=6] - Active simulation speed multiplier.
 * @param {number} [efficiencyPenalty=0] - Village starvation efficiency penalty (0..0.8).
 * @returns {string} Zero-padded real-time `HH:MM:SS` duration string.
 */
export function formatRealHoursHMS(inGameHours, speedFactor = 6, efficiencyPenalty = 0) {
  // Keep parity with calculateBuildTimestamps / startCraftRecipe which floor efficiency at 0.2.
  const effMult = Math.max(0.2, 1 - (Number(efficiencyPenalty) || 0));
  const virtualMs = ((Number(inGameHours) || 0) / effMult) * REAL_MS_PER_INGAME_HOUR;
  return formatRealDurationHMS(virtualMs, speedFactor);
}

/**
 * Formats the exact local wall-clock timestamp (`HH:MM:SS`) when a task will conclude.
 * Example: started at 10:00:00 needing 00:02:15 real time displays `10:02:15`.
 *
 * @param {number} virtualRemainingMs - Remaining virtual milliseconds.
 * @param {number} [speedFactor=6] - Active simulation speed multiplier.
 * @param {number} [nowWallMs=Date.now()] - Current wall-clock epoch ms.
 * @returns {string} Local `HH:MM:SS` completion clock timestamp.
 */
export function formatRealConclusionTimeHMS(
  virtualRemainingMs,
  speedFactor = 6,
  nowWallMs = Date.now(),
) {
  const safeSpeed = Number.isFinite(speedFactor) && speedFactor > 0 ? speedFactor : 6;
  const remainingRealMs = Math.max(0, ((Number(virtualRemainingMs) || 0) * 6) / safeSpeed);
  const endDate = new Date(nowWallMs + remainingRealMs);
  const hours = String(endDate.getHours()).padStart(2, '0');
  const minutes = String(endDate.getMinutes()).padStart(2, '0');
  const seconds = String(endDate.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Formats fractional in-game hour (0..24) into HH:MM clock text.
 *
 * @param {number} hourOfDay - Hour within [0, 24).
 * @returns {string} Clock string like "08:30".
 */
export function formatClockTime(hourOfDay) {
  const safe = ((hourOfDay % 24) + 24) % 24;
  const h = Math.floor(safe);
  const m = Math.floor((safe - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats a resource cost dictionary `{ sticks: 4, small_stones: 3 }` for UI badges.
 *
 * @param {Record<string, number>} cost - Cost dictionary.
 * @returns {string} Comma-separated readable resource requirements.
 */
export function formatCostSummary(cost) {
  const entries = Object.entries(cost ?? {});
  if (entries.length === 0) return 'Free';
  return entries
    .map(([id, qty]) => `${qty} ${RESOURCES[id]?.name ?? id}`)
    .join(', ');
}

/**
 * Returns the Tailwind color class for unit availability counters:
 * - `0/0` (none trained): gray (`text-slate-500`)
 * - `0/N` (none free): red (`text-rose-400`)
 * - `1..N-1/N` (partial free): yellow (`text-amber-300`)
 * - `N/N` (all free): green (`text-emerald-400`)
 *
 * @param {number} freeCount
 * @param {number} totalCount
 * @returns {string} Tailwind text color class.
 */
export function getUnitAvailabilityColorClass(freeCount, totalCount) {
  if ((totalCount ?? 0) <= 0) return 'text-slate-500';
  if ((freeCount ?? 0) <= 0) return 'text-rose-400';
  if (freeCount < totalCount) return 'text-amber-300';
  return 'text-emerald-400';
}

/**
 * Returns threshold color class for utilization pools (`Storage`, `Pop`):
 * - `100%` (`used >= capacity`): red (`text-rose-400`)
 * - `>90%`: orange (`text-orange-400`)
 * - otherwise `defaultClass`.
 *
 * @param {number} used
 * @param {number} capacity
 * @param {string} [defaultClass='text-slate-200']
 * @returns {string} Tailwind text color class.
 */
export function getCapacityHighColorClass(used, capacity, defaultClass = 'text-slate-200') {
  if ((capacity ?? 0) <= 0 || used >= capacity) return 'text-rose-400';
  if (used / capacity > 0.9) return 'text-orange-400';
  return defaultClass;
}

/**
 * Returns threshold color class for consumable reserves (`Food`, `Water`):
 * - `0%` (`current <= 0`): red (`text-rose-400`)
 * - `<10%` of reference capacity: orange (`text-orange-400`)
 * - otherwise `defaultClass`.
 *
 * @param {number} current
 * @param {number} capacity
 * @param {string} [defaultClass='text-slate-200']
 * @returns {string} Tailwind text color class.
 */
export function getReserveLowColorClass(current, capacity, defaultClass = 'text-slate-200') {
  if ((current ?? 0) <= 0) return 'text-rose-400';
  if ((capacity ?? 0) > 0 && current / capacity < 0.1) return 'text-orange-400';
  return defaultClass;
}
