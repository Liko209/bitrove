// Reusable job widgets used by both Dashboard and (until v0.0.39)
// Library. Kept in one file so the empty/active/finished visual
// language stays consistent across pages.

import { Link } from "react-router-dom";
import type { Job } from "../lib/api.ts";
import { formatDurationSeconds } from "../lib/format.ts";

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} hr ago`;
  return new Date(ts).toLocaleDateString();
}

/* ── Active jobs banner ─────────────────────────────────────────
   Renders nothing when nothing's in flight. Clicking a card opens
   the matching /jobs/<id> detail. */
export function ActiveJobsBanner({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="t-section mb-3">Indexing in progress</h2>
      <div className="space-y-3">
        {jobs.map((j) => (
          <ActiveJobCard key={j.id} job={j} />
        ))}
      </div>
    </section>
  );
}

function ActiveJobCard({ job }: { job: Job }) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const elapsed = (Date.now() - job.startedAt) / 1000;
  const rate = elapsed > 0 ? job.done / elapsed : 0;
  const remaining = rate > 0 ? (job.total - job.done) / rate : Infinity;
  return (
    <Link
      to={`/jobs/${job.id}`}
      className="block bg-white rounded-xl border border-stone-200 hover:border-stone-300 transition p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="relative inline-block h-2.5 w-2.5 shrink-0">
          <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
          <span className="absolute inset-0 rounded-full bg-emerald-500" />
        </span>
        <div className="text-sm font-medium text-stone-900 truncate flex-1">{job.description}</div>
        <div className="text-stone-400 text-sm">Open job →</div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <Metric label="Progress" value={`${pct}%`} sub={`${job.done.toLocaleString()} / ${job.total.toLocaleString()}`} />
        <Metric label="Time left" value={formatDurationSeconds(remaining)} />
        <Metric label="Indexed" value={`+${job.ingested}`} />
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-stone-900 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="t-section">{label}</div>
      <div className="text-xl font-semibold text-stone-900 tabular-nums leading-none mt-1">{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}

/* ── Recent jobs row ────────────────────────────────────────────
   Persistent path back to terminal jobs. Hidden whenever there's
   anything active (the banner above is already the focus then). */
export function RecentJobsRow({
  jobs,
  hideWhenActive,
  limit = 5,
}: {
  jobs: Job[];
  hideWhenActive?: boolean;
  limit?: number;
}) {
  if (hideWhenActive) return null;
  const visible = jobs.slice(0, limit);
  if (visible.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="t-section">Recent jobs</h2>
        <Link
          to="/jobs"
          className="text-[10px] text-stone-400 hover:text-stone-900 underline-offset-2 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {visible.map((j) => {
          const cls =
            j.status === "failed"
              ? "bg-rose-500"
              : j.status === "stopped"
                ? "bg-amber-500"
                : "bg-emerald-500";
          const label =
            j.status === "failed"
              ? "Failed"
              : j.status === "stopped"
                ? "Paused"
                : "Done";
          const when = j.finishedAt ? relativeTime(j.finishedAt) : "—";
          return (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-stone-50 transition"
            >
              <span className={"w-1.5 h-1.5 rounded-full shrink-0 " + cls} />
              <span className="flex-1 min-w-0 truncate text-stone-800" title={j.description}>
                {j.description}
              </span>
              <span className="shrink-0 t-section">{label}</span>
              {j.errors > 0 && (
                <span className="shrink-0 text-xs text-rose-700 tabular-nums">
                  {j.errors} error{j.errors === 1 ? "" : "s"}
                </span>
              )}
              <span className="shrink-0 text-xs text-stone-400 tabular-nums">
                {j.done.toLocaleString()} / {j.total.toLocaleString()}
              </span>
              <span className="shrink-0 text-xs text-stone-400">{when}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
