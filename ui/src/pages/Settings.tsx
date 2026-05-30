// Settings — for now the only thing that lives here is the ingest-filter
// configuration. Two concepts:
//
//   - File-type defaults: extensions Bitrove will skip when scanning a
//     folder. Shown grouped by purpose with a "what's supported" reference
//     so the user knows what they're toggling between.
//
//   - Folder name defaults: directory names (NOT paths) Bitrove skips
//     entirely when it sees them during a scan. Free-text editor.
//
// Per-folder-scan overrides happen in the ScanConfirmModal, not here.

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

type SettingsResponse = Awaited<ReturnType<typeof api.getIngestSettings>>;

export default function Settings() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [excludedExts, setExcludedExts] = useState<Set<string>>(new Set());
  const [excludedFolders, setExcludedFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [status, setStatus] = useState<null | "saving" | "saved" | "error">(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSupported, setShowSupported] = useState(true);

  useEffect(() => {
    api
      .getIngestSettings()
      .then((d) => {
        setData(d);
        setExcludedExts(new Set(d.current.excludedExts));
        setExcludedFolders(d.current.excludedFolders);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  async function save() {
    setStatus("saving");
    try {
      await api.saveIngestSettings({
        excludedExts: [...excludedExts],
        excludedFolders,
      });
      setStatus("saved");
      setTimeout(() => setStatus(null), 1800);
    } catch (e) {
      setStatus("error");
      setErr((e as Error).message);
    }
  }

  function toggleExt(ext: string) {
    setExcludedExts((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  }

  function addFolder() {
    const v = newFolder.trim().replace(/^\/+|\/+$/g, "");
    if (!v) return;
    if (excludedFolders.includes(v)) return;
    setExcludedFolders([...excludedFolders, v]);
    setNewFolder("");
  }

  function removeFolder(name: string) {
    setExcludedFolders(excludedFolders.filter((f) => f !== name));
  }

  function resetToDefaults() {
    if (!data) return;
    setExcludedExts(new Set(data.defaults.excludedExts));
    setExcludedFolders(data.defaults.excludedFolders);
  }

  if (err && !data) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif-display text-4xl text-stone-900 mb-2">Settings</h1>
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-sm">
          {err}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto text-sm text-stone-500">Loading…</div>
    );
  }

  // Universe of extensions to render as toggles: union of the supported
  // catalog, the current excluded set, and the curated default-excluded
  // set. Anything the user typed manually still shows up.
  const allCategoryExts = new Set(
    data.supportedTypes.flatMap((g) => g.exts),
  );
  for (const e of excludedExts) allCategoryExts.add(e);
  for (const e of data.defaults.excludedExts) allCategoryExts.add(e);

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="font-serif-display text-4xl text-stone-900">Settings</h1>
        <button
          onClick={resetToDefaults}
          className="text-xs text-stone-500 hover:text-stone-900 underline"
        >
          Reset to recommended defaults
        </button>
      </div>
      <p className="text-stone-600 text-sm mb-8">
        These rules only apply when you add a whole folder to your library.
        Picking individual files always works, even for excluded types — we'll
        just warn you in case it's a mistake.
      </p>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-3">
          File types to skip when scanning a folder
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          Checked = skipped. Unchecked = included. Code-like types are off by
          default because they're usually source files, not knowledge.
        </p>

        <div className="space-y-4">
          {data.supportedTypes.map((group) => (
            <CategoryBlock
              key={group.group}
              group={group}
              excludedExts={excludedExts}
              onToggle={toggleExt}
            />
          ))}
        </div>

        <details className="mt-6 group" open={showSupported} onToggle={(e) => setShowSupported((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-900 list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition">▸</span>
            How file types map to indexing
          </summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-600">
            {data.supportedTypes.map((g) => (
              <div key={g.group} className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                <div className="font-medium text-stone-800">{g.group}</div>
                <div className="mt-0.5">{g.description}</div>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-3">
          Folder names to skip
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          If Bitrove sees a folder with one of these names anywhere inside what
          you're scanning, it'll skip the whole subtree. Match is on folder
          name, not full path.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {excludedFolders.length === 0 && (
            <span className="text-xs text-stone-400 italic">No folder names excluded.</span>
          )}
          {excludedFolders.map((f) => (
            <span
              key={f}
              className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-700 flex items-center gap-1.5"
            >
              <code className="font-mono">{f}</code>
              <button
                type="button"
                onClick={() => removeFolder(f)}
                className="text-stone-400 hover:text-rose-600"
                aria-label={`Remove ${f}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFolder()}
            placeholder="e.g. node_modules"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-stone-300 focus:border-stone-500 focus:outline-none font-mono"
          />
          <button
            onClick={addFolder}
            disabled={!newFolder.trim()}
            className="text-sm px-3 py-1.5 rounded-md font-medium bg-stone-100 text-stone-800 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-stone-50/95 backdrop-blur border-t border-stone-200 flex items-center gap-3">
        <span className="text-xs text-stone-500">
          {status === "saving" && "Saving…"}
          {status === "saved" && (
            <span className="text-emerald-700">Saved. New folder scans will use these rules.</span>
          )}
          {status === "error" && err && <span className="text-rose-700">{err}</span>}
        </span>
        <button
          onClick={save}
          className="ml-auto px-4 py-1.5 rounded-md text-sm font-medium bg-stone-900 text-white hover:bg-stone-700"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

function CategoryBlock({
  group,
  excludedExts,
  onToggle,
}: {
  group: { group: string; description: string; exts: string[] };
  excludedExts: Set<string>;
  onToggle: (ext: string) => void;
}) {
  const excludedCount = group.exts.filter((e) => excludedExts.has(e)).length;
  const allOff = excludedCount === group.exts.length;
  const allOn = excludedCount === 0;
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <div className="font-medium text-stone-900">{group.group}</div>
        <span className="text-[11px] text-stone-500">
          {allOff
            ? "all skipped"
            : allOn
              ? "all included"
              : `${group.exts.length - excludedCount} of ${group.exts.length} included`}
        </span>
      </div>
      <div className="text-xs text-stone-500 mb-3">{group.description}</div>
      <div className="flex flex-wrap gap-1.5">
        {group.exts.map((ext) => {
          const off = excludedExts.has(ext);
          return (
            <button
              key={ext}
              type="button"
              onClick={() => onToggle(ext)}
              className={
                "text-xs px-2.5 py-1 rounded-full font-mono tabular-nums transition " +
                (off
                  ? "bg-stone-100 text-stone-400 line-through hover:bg-stone-200"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100")
              }
              title={off ? `Click to include ${ext}` : `Click to skip ${ext}`}
            >
              {ext}
            </button>
          );
        })}
      </div>
    </div>
  );
}
