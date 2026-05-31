// Confirm-with-strong-warning modal shown when the user picks a
// non-current tier in Settings → Models. The full switch is a heavy
// operation (download → llama-server restart → drop chunks → re-
// ingest) so this modal makes the cost crystal clear before the user
// commits.

import { useEffect, useState } from "react";
import { tierMeta, formatBytes, type Tier } from "../lib/tiers.ts";
import { api } from "../lib/api.ts";

export default function SwitchTierModal({
  fromTier,
  toTier,
  onCancel,
  onLaunched,
}: {
  fromTier: Tier;
  toTier: Tier;
  onCancel: () => void;
  // Called after we've kicked the orchestrator and want the page to
  // navigate to /jobs so the user can watch the re-ingest.
  onLaunched: () => void;
}) {
  const [indexedFiles, setIndexedFiles] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const target = tierMeta(toTier);
  const current = tierMeta(fromTier);

  // Pull the current file count so we can give a meaningful time
  // estimate. Falls back to a generic "your indexed files" if the
  // request fails.
  useEffect(() => {
    api
      .stats()
      .then((s) => setIndexedFiles(s.total.sources))
      .catch(() => setIndexedFiles(0));
  }, []);

  const sameDim = current.embedDim === target.embedDim;
  const fileCount = indexedFiles ?? 0;
  // Conservative estimate: divide by docs/sec, round up to minutes.
  const estSeconds = fileCount > 0 ? fileCount / target.estDocsPerSec : 0;
  const estDisplay =
    estSeconds < 60
      ? `under a minute`
      : estSeconds < 3600
        ? `~${Math.round(estSeconds / 60)} min`
        : `~${(estSeconds / 3600).toFixed(1)} hr`;

  async function confirm() {
    const bridge = window.bitrove as { switchModelTier?: (t: Tier) => Promise<unknown> } | undefined;
    if (!bridge?.switchModelTier) {
      setErr("This feature only works inside the Bitrove app.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await bridge.switchModelTier(toTier);
      onLaunched();
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/40 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 shrink-0">
          <h2 className="font-serif-display text-[22px] text-stone-900">
            Switch model tier?
          </h2>
          <p className="text-xs text-stone-500 mt-1.5">
            <strong>{current.label}</strong> ({current.embedName}) →{" "}
            <strong>{target.label}</strong> ({target.embedName})
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4 text-sm text-stone-700">
          {err && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded">
              {err}
            </div>
          )}

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-amber-900">
            <div className="font-semibold">What this means</div>
            <ul className="text-xs space-y-1.5 leading-relaxed">
              <li>
                • Your <strong className="tabular-nums">{fileCount.toLocaleString()}</strong>{" "}
                indexed file{fileCount === 1 ? "" : "s"} will be <strong>rebuilt</strong>.
                {sameDim
                  ? " The vector space is different even though the dimension matches — old embeddings can't carry over."
                  : ` The vector dimension changes (${current.embedDim} → ${target.embedDim}), so the chunk_vecs table will be dropped and recreated.`}
              </li>
              <li>
                • Estimated rebuild time: <strong>{estDisplay}</strong>{" "}
                <span className="text-amber-700">
                  ({target.estDocsPerSec} docs/sec on {target.label})
                </span>
              </li>
              <li>
                • Bitrove will use <strong>~{target.estRamGB} GB RAM</strong> during
                indexing. Other apps may slow down.
              </li>
              <li>
                • Search returns partial results until the rebuild finishes.
              </li>
            </ul>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs leading-relaxed">
            <strong className="text-stone-800">💡 Tip:</strong> Indexing runs in the
            background — you can pause from <em>Jobs</em> any time and resume
            later. For big rebuilds, consider starting at the end of your work
            day. (Scheduled-for-tonight option is coming in a future release.)
          </div>

          <div className="text-xs text-stone-500">
            New model footprint: {formatBytes(target.embedSizeBytes)} download.{" "}
            If you haven't downloaded this tier before, that happens first.
          </div>
        </div>

        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center gap-3 shrink-0">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={submitting}
            className="ml-auto px-4 py-1.5 rounded-md text-sm font-medium bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-60"
          >
            {submitting ? "Switching…" : "Download + start now"}
          </button>
        </div>
      </div>
    </div>
  );
}
