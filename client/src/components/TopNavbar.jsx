import { NavLink } from 'react-router';
import { SPEED_OPTIONS } from '../hooks/useStoneAgeVillage.js';
import { formatClockTime } from '../utils/timeFormat.js';

/**
 * Persistent top navigation bar switching between Online (`/`) and Sandbox (`/sandbox`),
 * plus live calendar/day-night indicator and local dev simulation speed multiplier (1x..240x).
 *
 * @param {object} props
 * @param {number} props.speedFactor
 * @param {(nextSpeed: number) => void} props.onSpeedChange
 * @param {object} props.calendar
 * @param {number | null} [props.temperatureC=null]
 * @param {() => void} props.onResetVillage
 * @returns {import('react').JSX.Element}
 */
export default function TopNavbar({
  speedFactor,
  onSpeedChange,
  calendar,
  temperatureC = null,
  onResetVillage,
}) {
  const navLinkClass = ({ isActive }) =>
    `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
      isActive
        ? 'border-amber-400 bg-amber-500 text-slate-950 underline decoration-2 underline-offset-4'
        : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
    }`;

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-lg font-bold tracking-tight text-amber-400">Obelisk</span>

          <nav aria-label="Primary" className="flex items-center gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Online
            </NavLink>
            <NavLink to="/sandbox" className={navLinkClass}>
              Sandbox
            </NavLink>
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div
            className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-200"
            aria-label="In-game calendar"
          >
            <span className="capitalize text-amber-300">{calendar.season}</span>
            <span>
              Y{calendar.year} M{calendar.monthOfSeason} D{calendar.dayOfMonth}
            </span>
            <span className="text-slate-400">{formatClockTime(calendar.hourOfDay)}</span>
            {temperatureC !== null && (
              <span className="font-semibold text-cyan-300" title="Ambient Temperature">
                {temperatureC}°C
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                calendar.isDaylight
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'bg-indigo-500/20 text-indigo-300'
              }`}
            >
              {calendar.daylightPhase}
            </span>
          </div>

          <label className="inline-flex items-center gap-1.5 text-slate-300">
            <span>Speed</span>
            <select
              aria-label="Game Speed"
              value={speedFactor}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-amber-300 focus:border-amber-400 focus:outline-none"
            >
              {SPEED_OPTIONS.map((factor) => (
                <option key={factor} value={factor}>
                  {factor}x{factor === 6 ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onResetVillage}
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:border-rose-500/70 hover:text-rose-200"
          >
            Reset Save
          </button>
        </div>
      </div>
    </header>
  );
}
