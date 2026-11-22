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
