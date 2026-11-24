import { useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { SPEED_OPTIONS } from '../hooks/useStoneAgeVillage.js';
import { formatClockTime } from '../utils/timeFormat.js';

/**
 * Persistent top navigation bar switching between Offline (`/`) and Sandbox (`/sandbox`),
 * plus live calendar/day-night indicator, How-to-Play guide modal, and Sandbox speed selector.
 *
 * @param {object} props
 * @param {number} props.speedFactor
 * @param {(nextSpeed: number) => void} props.onSpeedChange
 * @param {boolean} [props.showSpeedSelect=true] - When false (Offline mode), locks speed display at 6x.
 * @param {object} props.calendar
 * @param {number | null} [props.temperatureC=null]
 * @param {() => void} props.onResetVillage
 * @returns {import('react').JSX.Element}
 */
export default function TopNavbar({
  speedFactor,
  onSpeedChange,
  showSpeedSelect = true,
  calendar,
  temperatureC = null,
  onResetVillage,
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const guideDialogRef = useRef(null);
  const guideTitleId = useId();

  useEffect(() => {
    const dialog = guideDialogRef.current;
    if (!dialog) return;

    if (guideOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!guideOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [guideOpen]);

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
              Offline
            </NavLink>
            <NavLink to="/sandbox" className={navLinkClass}>
              Sandbox
            </NavLink>
          </nav>

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:border-sky-500/70 hover:bg-slate-800"
          >
            How to Play
          </button>
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

          {showSpeedSelect ? (
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
          ) : (
            <span
              aria-label="Fixed Game Speed"
              className="rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-amber-300"
            >
              Speed 6x
            </span>
          )}

          <button
            type="button"
            onClick={onResetVillage}
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:border-rose-500/70 hover:text-rose-200"
          >
            Reset Save
          </button>
        </div>
      </div>

      <dialog
        ref={guideDialogRef}
        closedby="any"
        aria-labelledby={guideTitleId}
        onClose={() => setGuideOpen(false)}
        className="m-auto w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-slate-950/75"
      >
        {guideOpen ? (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 id={guideTitleId} className="text-base font-bold text-amber-300">
                How to Play — Stone Age Guide
              </h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5 text-slate-300">
              <section>
                <h3 className="font-semibold text-amber-200">1. Map, Units &amp; Missions</h3>
                <p>
                  Left-click <strong>Main Village Hall (12, 12)</strong> to train Gatherers, Hunters,
                  and Builders. Right-click any explored Territory tile to dispatch{' '}
                  <strong>Gather</strong>, <strong>Hunt</strong>, <strong>Collect Water</strong>, a{' '}
                  <strong>Team</strong>, or <strong>Build</strong>. Teams reveal a 3×3 frontier when
                  they return.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-amber-200">2. Auto-Feeding, Water &amp; Spoilage</h3>
                <p>
                  Only <strong>active units and building workers (`Pop Used`)</strong> eat 1 food + 1
                  water bowl per in-game day. Edible items are eaten automatically{' '}
                  <strong>fastest-spoiling first</strong>. Cook raw meat/fish at a{' '}
                  <strong>Firepit</strong>, or craft <strong>Drying Racks</strong> (with Salt boiled
                  at the Firepit) to slash daily spoilage.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-amber-200">3. Starvation Debuffs &amp; Recovery</h3>
                <p>
                  Missing food or water stacks daily penalties: <strong>Hunger I (-10%)</strong>,{' '}
                  <strong>II (-30%)</strong>, <strong>III (-50%)</strong>,{' '}
                  <strong>Sickness (-80%)</strong>, and <strong>Death (-80% + -10% max pop/day)</strong>.
                  If max pop hits 0, the village is abandoned. Fed days recover +20% efficiency and
                  +10% max pop per day.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-amber-200">4. Storage, Upgrades &amp; Copper Age</h3>
                <p>
                  <strong>Main</strong>, <strong>House</strong>, <strong>Warehouse</strong>, and{' '}
                  <strong>Drying Rack</strong> build from basic materials (Sticks, Pelts, Straw),
                  while <strong>Firepit</strong> and <strong>Clay Kiln</strong> require Small Stones.
                  Upgrading Main adds +250 storage, +10 max pop, and scales water bowls (10 / 25 /
                  50). Research <strong>Stone Tools</strong> at Firepit, pan rivers for{' '}
                  <strong>Copper Nuggets</strong>, and smelt a <strong>Copper Ingot</strong> at the
                  Kiln to unlock Copper Age.
                </p>
                <p className="mt-1 text-[11px] text-amber-300">
                  Desktop Note: Built for Desktop mouse controls (left/right-click menus &amp; wheel
                  zoom); mobile/phone touch browsers are not fully supported yet.
                </p>
              </section>
            </div>
          </div>
        ) : null}
      </dialog>
    </header>
  );
}
