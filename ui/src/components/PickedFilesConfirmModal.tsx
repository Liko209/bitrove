// Confirm-and-warn modal for the "Pick specific files" Add flow.
//
// Why a separate modal from ScanConfirmModal: when the user explicitly
// hand-picks files we *don't* want to filter them out the way a folder
// scan would. We do still want to tell the user "by the way, some of
// these are types you said don't index" so they can either back out or
// override knowingly. The set is finite and chosen, so there's no scan
// preview to run — we just list every picked file with kind/size and
// flag the warnings.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import { bytes } from "../lib/format.ts";
import { BookIcon, FileIcon, PaperclipIcon } from "./icons.tsx";

type PickedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
};

// Subset of SUPPORTED_TYPES, hard-coded to avoid an extra round-trip just
// to render an icon. Keep loosely in sync with src/settings.ts. Anything
// not matched falls through to a neutral paperclip.
const TEXT_EXTS = new Set([
  ".pdf", ".docx", ".doc", ".rtf", ".odt",
  ".md", ".mdx", ".markdown", ".txt", ".rst", ".adoc", ".org",
  ".html", ".htm",
  ".xlsx", ".xls", ".csv", ".tsv",
  ".pptx", ".ppt", ".key",
]);
const BOOK_EXTS = new Set([".epub", ".mobi", ".azw3"]);

function iconFor(ext: string, size = 14, className = "") {
  if (BOOK_EXTS.has(ext)) return <BookIcon size={size} className={className} />;
  if (TEXT_EXTS.has(ext)) return <FileIcon size={size} className={className} />;
  return <PaperclipIcon size={size} className={className} />;
}

export default function PickedFilesConfirmModal({
  files,
  onCancel,
  onConfirm,
}: {
  files: PickedFile[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [excludedExts, setExcludedExts] = useState<Set<string> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIngestSettings()
      .then((s) => setExcludedExts(new Set(s.current.excludedExts)))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const flagged = useMemo(() => {
    if (!excludedExts) return [];
    return files.filter((f) => excludedExts.has(f.ext));
  }, [files, excludedExts]);

  // Group flagged warnings by ext for a compact summary line.
  const flaggedByExt = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flagged) m.set(f.ext, (m.get(f.ext) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [flagged]);

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/40 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-stone-100 shrink-0">
          <h2 className="font-serif-display text-[22px] text-stone-900">
            Add {files.length} file{files.length === 1 ? "" : "s"} to your library?
          </h2>
          <p className="text-xs text-stone-500 mt-1.5">
            These will be indexed individually. {bytes(totalBytes)} total.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {err && (
            <div className="p-3 mb-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-sm">
              {err}
            </div>
          )}

          {flaggedByExt.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="font-medium text-amber-900 mb-1">
                Heads up — some of these are types you said don't index by default
              </div>
              <div className="text-xs text-amber-800">
                {flaggedByExt.map(([ext, count], i) => (
                  <span key={ext}>
                    {i > 0 && ", "}
                    <code className="font-mono">{ext}</code>{" "}
                    <span className="text-amber-700">× {count}</span>
                  </span>
                ))}
                . They'll still be added because you picked them by name. To stop
                seeing this warning,{" "}
                <Link to="/settings" className="underline hover:no-underline">
                  remove these types from your filter list
                </Link>
                .
              </div>
            </div>
          )}

          <ul className="space-y-1">
            {files.map((f) => {
              const isFlagged = excludedExts?.has(f.ext) ?? false;
              return (
                <li
                  key={f.path}
                  className="flex items-center gap-2 text-xs text-stone-700 py-1"
                >
                  <span className="shrink-0 text-stone-400">{iconFor(f.ext, 14)}</span>
                  <span
                    className={
                      "truncate font-mono " + (isFlagged ? "text-amber-900" : "")
                    }
                    title={f.path}
                  >
                    {f.name}
                  </span>
                  {isFlagged && (
                    <span className="shrink-0 px-1.5 py-0.5 label-eyebrow rounded bg-amber-50 text-amber-800 border border-amber-200">
                      off by default
                    </span>
                  )}
                  <span className="text-stone-400 tabular-nums shrink-0 ml-auto">
                    {bytes(f.size)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center gap-3 shrink-0">
          <span className="text-xs text-stone-500">
            Runs in the background. Pause any time.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={files.length === 0}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add {files.length} file{files.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
