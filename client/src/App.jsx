import {
  DEFAULT_CONTINENT_SIZE,
  DEFAULT_TERRITORY_SIZE,
  TIME_SCALE,
} from '@obelisk/shared';

/**
 * Minimal Stage 0 shell verifying that @obelisk/client bundles
 * @obelisk/shared constants and renders with Tailwind CSS.
 *
 * @returns {import('react').JSX.Element}
 */
export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <section className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight text-amber-400">
          Obelisk — Stage 0 Ready
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Monorepo workspace wiring verified between <code className="text-amber-300">@obelisk/client</code> and{' '}
          <code className="text-amber-300">@obelisk/shared</code>.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-800">
            <dt className="text-slate-400">Continent</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-slate-100">
              {DEFAULT_CONTINENT_SIZE}×{DEFAULT_CONTINENT_SIZE}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-800">
            <dt className="text-slate-400">Territory</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-slate-100">
              {DEFAULT_TERRITORY_SIZE}×{DEFAULT_TERRITORY_SIZE}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-800">
            <dt className="text-slate-400">Time Scale</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-slate-100">
              {TIME_SCALE}×
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
