// First-run guided onboarding for picking a watched root.
//
// Triggers when Bitrove has zero indexed sources AND zero watched roots
// AND the on-device models are ready — i.e. the user just got past the
// model-download step and Library is empty. Walks them through:
//
//   1. Welcome     — explain what this folder will be used for.
//   2. Starting    — pick where "most of my documents live" (iCloud /
//                    Documents / Desktop / Downloads / custom).
//   3. Narrow      — show the top-level subdirs of the picked starting
//                    point with rough file counts, let them pick a
//                    smaller sub-tree. This is the productively
//                    important step: a fresh Documents folder might
//                    have 50k files, but a user's actual "knowledge"
//                    lives in ~/Documents/Notes (1.2k).
//   4. Confirm     — show what we picked + watch toggle + final start.
//
// Picks then go through the normal /api/ingest/scan with
// watchAfterScan=true, so the rest of the flow (preview confirm modal,
// jobs page, watcher) is unchanged.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.ts";
import { bytes, shortPath } from "../lib/format.ts";
import {
  CloudIcon,
  DesktopIcon,
  DownloadIcon,
  FolderIcon,
  FolderOpenIcon,
} from "./icons.tsx";

type StartIcon = "cloud" | "folder" | "desktop" | "download";
type StartChoice = {
  label: string;
  icon: StartIcon;
  hint: string;
  path: string;
};

function iconFor(kind: StartIcon, size = 22) {
  switch (kind) {
    case "cloud": return <CloudIcon size={size} />;
    case "folder": return <FolderOpenIcon size={size} />;
    case "desktop": return <DesktopIcon size={size} />;
    case "download": return <DownloadIcon size={size} />;
  }
}

type Step = "welcome" | "starting" | "narrow" | "confirm";

export default function FirstRunWizard({
  onSkip,
  onLaunched,
}: {
  onSkip: () => void;
  onLaunched: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [starts, setStarts] = useState<StartChoice[]>([]);
  const [startPath, setStartPath] = useState<string | null>(null);
  const [subdirs, setSubdirs] = useState<{
    name: string;
    path: string;
    estimate: number;
    size: number;
  }[] | null>(null);
  const [loadingSubdirs, setLoadingSubdirs] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [watchAfter, setWatchAfter] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  const bridge = window.bitrove;

  // Probe which of the standard starting locations actually exist.
  useEffect(() => {
    if (!bridge?.autodetectSources) {
      setStarts([]);
      return;
    }
    bridge
      .autodetectSources()
      .then((items) => {
        const tpl: Record<string, { icon: StartIcon; hint: string }> = {
          "iCloud Drive": { icon: "cloud", hint: "Syncs across all your Apple devices" },
          "Documents": { icon: "folder", hint: "Your local Documents folder" },
          "Desktop": { icon: "desktop", hint: "Files sitting on your desktop" },
          "Downloads": { icon: "download", hint: "What lands here from the browser" },
        };
        const out: StartChoice[] = [];
        for (const it of items) {
          if (!it.exists) continue;
          const t = tpl[it.label] ?? { icon: "folder" as StartIcon, hint: it.path };
          out.push({ label: it.label, icon: t.icon, hint: t.hint, path: it.path });
        }
        setStarts(out);
      })
      .catch(() => setStarts([]));
  }, []);

  // When the user picks a starting location, load its top-level subdirs.
  useEffect(() => {
    if (step !== "narrow" || !startPath) return;
    setLoadingSubdirs(true);
    setSubdirs(null);
    api
      .listSubdirs(startPath)
      .then((r) => setSubdirs(r.subdirs))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoadingSubdirs(false));
  }, [step, startPath]);

  async function launch(path: string) {
    setErr(null);
    try {
      await api.ingestScan(path, { watchAfterScan: watchAfter });
      onLaunched();
      navigate("/jobs");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // ── steps ─────────────────────────────────────────────────────
  const isFinalStep = step === "confirm";

  return (
    <section className="mb-10 bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-7 pt-6 pb-4 border-b border-stone-100 flex items-baseline gap-3">
        <h2 className="font-serif-display text-2xl text-stone-900">
          {step === "welcome" && "Get Bitrove set up"}
          {step === "starting" && "Where do your documents live?"}
          {step === "narrow" && "Narrow it down"}
          {step === "confirm" && "Ready to index"}
        </h2>
        <span className="ml-auto text-xs text-stone-400 tabular-nums">
          Step {step === "welcome" ? 1 : step === "starting" ? 2 : step === "narrow" ? 3 : 4} of 4
        </span>
        <button
          onClick={onSkip}
          className="text-xs text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
        >
          Skip
        </button>
      </div>

      <div className="px-7 py-6 min-h-[260px]">
        {err && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded text-sm">
            {err}
          </div>
        )}

        {step === "welcome" && (
          <div className="max-w-xl">
            <p className="text-stone-700 leading-relaxed mb-3">
              Bitrove turns a folder on your Mac into a searchable knowledge
              library that your AI agents can read — all on this device, nothing
              in the cloud.
            </p>
            <p className="text-stone-700 leading-relaxed mb-6">
              We'll pick one folder to start with. You can add more later.
              Bitrove will keep it in sync as you add or remove files.
            </p>
            <button
              onClick={() => setStep("starting")}
              className="px-4 py-2 rounded-md bg-stone-900 text-white text-sm font-medium hover:bg-stone-700"
            >
              Let's start
            </button>
          </div>
        )}

        {step === "starting" && (
          <div>
            <p className="text-stone-600 text-sm mb-5">
              Pick where most of your documents live. You'll be able to narrow
              down in the next step.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {starts.map((s) => (
                <button
                  key={s.path}
                  onClick={() => {
                    setStartPath(s.path);
                    setSelectedPath(s.path);
                    setStep("narrow");
                  }}
                  className="text-left p-4 rounded-xl border border-stone-200 hover:border-stone-400 hover:bg-stone-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-stone-500">{iconFor(s.icon, 22)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-900">{s.label}</div>
                      <div className="text-xs text-stone-500 mt-0.5 truncate">{s.hint}</div>
                    </div>
                  </div>
                </button>
              ))}
              <button
                onClick={async () => {
                  if (!bridge) {
                    alert("Folder picker only works inside the Bitrove app.");
                    return;
                  }
                  const p = await bridge.pickFolder();
                  if (p) {
                    setStartPath(p);
                    setSelectedPath(p);
                    setStep("narrow");
                  }
                }}
                className="text-left p-4 rounded-xl border border-dashed border-stone-300 hover:border-stone-500 hover:bg-stone-50 transition col-span-1 sm:col-span-2"
              >
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-stone-500">
                    <FolderIcon size={22} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-900">Choose a different folder…</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      Anywhere on your Mac.
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "narrow" && startPath && (
          <div>
            <p className="text-stone-600 text-sm mb-4">
              You don't have to index all of{" "}
              <code className="font-mono text-stone-800 bg-stone-100 px-1.5 py-0.5 rounded">
                {shortPath(startPath)}
              </code>
              . Picking a subfolder makes search faster and more relevant.
            </p>

            <div className="space-y-1.5 mb-5">
              <label className={subdirRowClass(selectedPath === startPath)}>
                <input
                  type="radio"
                  name="pick"
                  checked={selectedPath === startPath}
                  onChange={() => setSelectedPath(startPath)}
                  className="accent-stone-900"
                />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-stone-900">Everything in this folder</span>
                  <span className="block text-xs text-stone-500 mt-0.5 font-mono truncate">
                    {shortPath(startPath)}
                  </span>
                </span>
                <span className="text-xs text-stone-500">all</span>
              </label>

              {loadingSubdirs && (
                <div className="text-sm text-stone-500 py-4 flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                  Reading subfolders…
                </div>
              )}

              {subdirs && subdirs.length === 0 && !loadingSubdirs && (
                <div className="text-xs text-stone-500 italic py-2">
                  No subfolders found inside this folder.
                </div>
              )}

              {subdirs && subdirs.slice(0, 10).map((d) => (
                <label key={d.path} className={subdirRowClass(selectedPath === d.path)}>
                  <input
                    type="radio"
                    name="pick"
                    checked={selectedPath === d.path}
                    onChange={() => setSelectedPath(d.path)}
                    className="accent-stone-900"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-stone-900">{d.name}</span>
                    <span className="block text-xs text-stone-500 mt-0.5 font-mono truncate">
                      {shortPath(d.path)}
                    </span>
                  </span>
                  <span className="text-xs text-stone-500 tabular-nums shrink-0">
                    {d.estimate >= 5000 ? "5000+" : d.estimate.toLocaleString()} files
                    {d.size > 0 && (
                      <span className="text-stone-400"> · {bytes(d.size)}</span>
                    )}
                  </span>
                </label>
              ))}
              {subdirs && subdirs.length > 10 && (
                <div className="text-xs text-stone-400 pl-7">
                  + {subdirs.length - 10} more subfolders. Add them separately later.
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("starting")}
                className="text-sm text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                disabled={!selectedPath}
                className="ml-auto px-4 py-1.5 rounded-md bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {isFinalStep && selectedPath && (
          <div className="max-w-xl">
            <p className="text-stone-600 text-sm mb-1">Bitrove will index</p>
            <div className="font-mono text-stone-900 text-base mb-5 truncate" title={selectedPath}>
              {shortPath(selectedPath)}
            </div>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-stone-200 mb-5 cursor-pointer hover:bg-stone-50">
              <input
                type="checkbox"
                checked={watchAfter}
                onChange={(e) => setWatchAfter(e.target.checked)}
                className="mt-0.5 accent-stone-900"
              />
              <div>
                <div className="font-medium text-stone-900 text-sm">
                  Keep this folder in sync
                </div>
                <div className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                  Bitrove will check for new and changed files every 30 minutes
                  and update the index automatically. You'll see deleted files
                  in Library and choose whether to clean up the index.
                </div>
              </div>
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("narrow")}
                className="text-sm text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
              >
                ← Back
              </button>
              <button
                onClick={() => launch(selectedPath)}
                className="ml-auto px-4 py-2 rounded-md bg-stone-900 text-white text-sm font-medium hover:bg-stone-700"
              >
                Start indexing
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function subdirRowClass(active: boolean): string {
  return (
    "flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer " +
    (active
      ? "border-stone-900 bg-stone-50"
      : "border-stone-200 hover:bg-stone-50")
  );
}
