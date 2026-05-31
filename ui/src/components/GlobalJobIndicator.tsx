// Pinned in the page header.
//   - Something running     → solid dark chip with %% progress
//   - Nothing running, but a recent job failed in the last 30 min
//                            → rose chip with "× error count" so the
//                              user has a way back to the failed job
//                              even though it's not in the active set
//   - Nothing running, but a recent job is stopped (paused)
//                            → amber chip
//   - Otherwise              → hidden
//
// Click → /jobs (which shows the latest job in detail).

import { Link } from "react-router-dom";
import { useJobs } from "../lib/useJobs.ts";

const ATTENTION_WINDOW_MS = 30 * 60 * 1000; // 30 min

export function GlobalJobIndicator() {
  const { active, recent } = useJobs(2000);

  if (active.length > 0) {
    const j = active[0];
    const pct = j.total > 0 ? Math.round((j.done / j.total) * 100) : 0;
    return (
      <Link
        to="/jobs"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-900 text-white text-xs font-medium hover:bg-stone-700"
        title={`${j.description}\n${j.done}/${j.total} done · ${j.errors} errors`}
      >
        <span className="relative inline-block h-2 w-2">
          <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75"></span>
          <span className="absolute inset-0 rounded-full bg-emerald-500"></span>
        </span>
        <span className="truncate max-w-[180px]">{j.description}</span>
        <span className="tabular-nums">{pct}%</span>
        {active.length > 1 && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded">+{active.length - 1}</span>
        )}
      </Link>
    );
  }

  // No active jobs — promote a recent terminal one if it deserves
  // attention (failed any time, or stopped within the last 30 min).
  const now = Date.now();
  const failed = recent.find((j) => j.status === "failed");
  const stopped = recent.find(
    (j) => j.status === "stopped" && j.finishedAt && now - j.finishedAt < ATTENTION_WINDOW_MS,
  );
  const attention = failed ?? stopped;
  if (!attention) return null;

  const isFailed = attention.status === "failed";
  return (
    <Link
      to="/jobs"
      className={
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition " +
        (isFailed
          ? "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
          : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100")
      }
      title={`${attention.description}\n${attention.done}/${attention.total} processed · ${attention.errors} errors`}
    >
      <span className={"w-1.5 h-1.5 rounded-full " + (isFailed ? "bg-rose-500" : "bg-amber-500")} />
      <span className="truncate max-w-[180px]">
        {isFailed ? "Last scan failed" : "Last scan paused"}
      </span>
      {attention.errors > 0 && (
        <span className="tabular-nums">{attention.errors} error{attention.errors === 1 ? "" : "s"}</span>
      )}
    </Link>
  );
}
