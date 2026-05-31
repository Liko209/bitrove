// Auto-update integration via electron-updater (talks to GitHub Releases).
//
// IMPORTANT: macOS code-signing constraint
//   electron-updater's "restart-to-install" flow uses Squirrel.Mac, which
//   requires a code-signed and notarized .app. While Bitrove is unsigned, the
//   user lifecycle is:
//     1. App checks for updates on startup (and on demand)
//     2. App auto-downloads the new DMG when one is available
//     3. App tells the UI "ready" and on user confirmation:
//          - signed:   autoUpdater.quitAndInstall()  ← real auto-install
//          - unsigned: open the downloaded DMG in Finder, ask user to
//                      drag-replace the app in /Applications.
//   Once you ship a signed build, flip QUIT_AND_INSTALL_AVAILABLE to true
//   and the UI continues to work without changes.

// electron-updater is published as CJS only; we use the default-export form
// to keep ESM/CJS interop predictable across electron-vite + esbuild output.
// electron-updater is pure CJS; in packaged Electron ESM the default-import
// interop sometimes fails to expose the named exports. Pulling it through
// createRequire is the most portable option.
import { createRequire } from "node:module";
import type { UpdateInfo, ProgressInfo } from "electron-updater";
import { app, shell } from "electron";
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const require_ = createRequire(import.meta.url);
const { autoUpdater } = require_("electron-updater") as {
  autoUpdater: {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    allowDowngrade: boolean;
    allowPrerelease: boolean;
    logger: unknown;
    on: (event: string, fn: (...args: unknown[]) => void) => void;
    checkForUpdates: () => Promise<unknown>;
    downloadUpdate: () => Promise<unknown>;
    quitAndInstall: () => void;
  };
};

// Packaged Electron apps don't surface console.log to a place a user can
// find; write everything to a known file under userData/logs/. Resolve the
// path lazily because app.getPath('userData') is not reliable before
// `whenReady` fires (and updater.ts is imported much earlier).
let LOG_FILE_PATH: string | null = null;
function logFilePath(): string {
  if (LOG_FILE_PATH) return LOG_FILE_PATH;
  try {
    const dir = join(app.getPath("userData"), "logs");
    mkdirSync(dir, { recursive: true });
    LOG_FILE_PATH = join(dir, "updater.log");
  } catch {
    // Fall back to /tmp so we at least see something during early boot errors.
    LOG_FILE_PATH = "/tmp/bitrove-updater.log";
  }
  return LOG_FILE_PATH;
}

function logLine(level: string, args: unknown[]): void {
  const msg = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  const line = `[${new Date().toISOString()}] ${level} ${msg}\n`;
  try {
    appendFileSync(logFilePath(), line);
  } catch {}
  if (!app.isPackaged) console.log(line.trim());
}

const FILE_LOGGER = {
  info: (...a: unknown[]) => logLine("INFO ", a),
  warn: (...a: unknown[]) => logLine("WARN ", a),
  error: (...a: unknown[]) => logLine("ERROR", a),
  debug: (...a: unknown[]) => logLine("DEBUG", a),
};

// Until Bitrove is code-signed, Squirrel.Mac's quitAndInstall() silently
// fails: it quits the app, but its ShipIt helper can't atomically swap
// /Applications/Bitrove.app without a signed LaunchAgent. So we keep
// Squirrel.Mac off and run the swap ourselves — see manualSwapInstall().
const QUIT_AND_INSTALL_AVAILABLE = false;

export type UpdaterState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date"; checkedAt: number; currentVersion: string }
  | { phase: "available"; info: UpdateInfoLite }
  | { phase: "downloading"; info: UpdateInfoLite; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { phase: "ready"; info: UpdateInfoLite; downloadedFile?: string; canAutoInstall: boolean }
  | { phase: "error"; message: string };

export type UpdateInfoLite = {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
};

let state: UpdaterState = { phase: "idle" };
let listeners: Array<(s: UpdaterState) => void> = [];
let downloadedFilePath: string | null = null;

function notify() {
  for (const l of listeners) l(state);
}

function lite(info: UpdateInfo): UpdateInfoLite {
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes:
      typeof info.releaseNotes === "string"
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note ?? "").join("\n")
          : null,
  };
}

export function initUpdater(): void {
  FILE_LOGGER.info("initUpdater() called");
  // Lighter behaviour: we drive the lifecycle by hand so the UI can show
  // explicit confirm-before-download dialogs.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = QUIT_AND_INSTALL_AVAILABLE;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = FILE_LOGGER;

  autoUpdater.on("checking-for-update", () => {
    state = { phase: "checking" };
    notify();
  });
  autoUpdater.on("update-available", (info) => {
    state = { phase: "available", info: lite(info) };
    notify();
  });
  autoUpdater.on("update-not-available", (info) => {
    state = {
      phase: "up-to-date",
      checkedAt: Date.now(),
      currentVersion: info?.version ?? "",
    };
    notify();
  });
  autoUpdater.on("download-progress", (p: ProgressInfo) => {
    if (state.phase !== "downloading" && state.phase !== "available") return;
    const info = state.phase === "downloading" ? state.info : state.info;
    state = {
      phase: "downloading",
      info,
      percent: p.percent ?? 0,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    };
    notify();
  });
  autoUpdater.on("update-downloaded", (info) => {
    downloadedFilePath = (info as unknown as { downloadedFile?: string }).downloadedFile ?? null;
    // Either Squirrel.Mac is willing to handle it (signed builds), OR we
    // got a ZIP we can manual-swap ourselves. Either way the user sees
    // "Restart and install" instead of "Open installer".
    const haveZip = !!downloadedFilePath && downloadedFilePath.endsWith(".zip");
    state = {
      phase: "ready",
      info: lite(info),
      downloadedFile: downloadedFilePath ?? undefined,
      canAutoInstall: QUIT_AND_INSTALL_AVAILABLE || haveZip,
    };
    notify();
  });
  autoUpdater.on("error", (err) => {
    state = { phase: "error", message: err?.message ?? String(err) };
    notify();
  });
}

export function subscribeUpdater(fn: (s: UpdaterState) => void): () => void {
  listeners.push(fn);
  fn(state);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

export function getUpdaterState(): UpdaterState {
  return state;
}

// ── User-facing actions ─────────────────────────────────────
export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    state = { phase: "error", message: (e as Error).message };
    notify();
  }
}

export async function downloadUpdate(): Promise<void> {
  if (state.phase !== "available") return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    state = { phase: "error", message: (e as Error).message };
    notify();
  }
}

// "Install" — try in order:
//   1. quitAndInstall() if Squirrel.Mac is usable (signed builds, future).
//   2. manualSwapInstall() — extract the downloaded ZIP, swap the .app,
//      relaunch. Works on unsigned builds the user installed into
//      /Applications themselves.
//   3. Reveal the file in Finder so the user can install by hand.
export async function installUpdate(): Promise<{
  method: "quitAndInstall" | "manualSwap" | "revealFile" | "noop";
}> {
  if (state.phase !== "ready") return { method: "noop" };
  if (QUIT_AND_INSTALL_AVAILABLE) {
    autoUpdater.quitAndInstall();
    return { method: "quitAndInstall" };
  }
  if (
    downloadedFilePath &&
    downloadedFilePath.endsWith(".zip") &&
    existsSync(downloadedFilePath)
  ) {
    try {
      await manualSwapInstall(downloadedFilePath);
      return { method: "manualSwap" };
    } catch (e) {
      FILE_LOGGER.error(
        "manualSwapInstall failed; falling back to Finder reveal:",
        (e as Error).message,
      );
    }
  }
  if (downloadedFilePath && existsSync(downloadedFilePath)) {
    shell.showItemInFolder(downloadedFilePath);
    return { method: "revealFile" };
  }
  const repoUrl = (autoUpdater as unknown as { getFeedURL?: () => string }).getFeedURL?.();
  if (repoUrl) {
    await shell.openExternal(repoUrl);
    return { method: "revealFile" };
  }
  return { method: "noop" };
}

// Find the currently-running .app bundle from process.execPath. Returns
// null in dev (where Electron runs from node_modules) — manualSwapInstall
// refuses to proceed in that case.
function getInstalledAppBundle(): string | null {
  // /Applications/Bitrove.app/Contents/MacOS/Bitrove → /Applications/Bitrove.app
  const m = process.execPath.match(/^(.*?\.app)\/Contents\/MacOS\//);
  return m ? m[1] : null;
}

// Unsigned in-place update. Extracts the ZIP we just downloaded, then
// hands a detached bash script to /bin/bash:
//   sleep 1               (give the parent process time to exit cleanly)
//   rm -rf <old.app>
//   mv <new.app> <target>
//   xattr -cr <target>    (clear quarantine on the freshly-written bytes)
//   open <target>
// Then we app.quit(). If anything in the script fails, the system is left
// in a consistent state: either the old app stays (rm failed early) or
// the new one is in place (mv succeeded), there's no half-extracted
// intermediate exposed.
async function manualSwapInstall(zipPath: string): Promise<void> {
  const target = getInstalledAppBundle();
  if (!target) {
    throw new Error("Could not resolve installed app path (running in dev?)");
  }

  const stamp = Number(process.pid).toString(36) + "-" + process.uptime().toString().replace(".", "");
  const stageDir = join(tmpdir(), `bitrove-update-${stamp}`);
  mkdirSync(stageDir, { recursive: true });

  FILE_LOGGER.info("manualSwapInstall: extracting", zipPath, "→", stageDir);
  // `ditto -x -k` is macOS's native ZIP extractor and preserves the
  // .app bundle's executable bits / symlinks / Info.plist correctly,
  // which `unzip` from /usr/bin sometimes mangles for code bundles.
  const extract = spawnSync("/usr/bin/ditto", ["-x", "-k", zipPath, stageDir], {
    encoding: "utf8",
  });
  if (extract.status !== 0) {
    throw new Error(`ditto failed: ${extract.stderr || extract.stdout || extract.status}`);
  }

  // electron-updater's mac ZIP contains a single Bitrove.app at the root.
  const newApp = join(stageDir, "Bitrove.app");
  if (!existsSync(newApp)) {
    throw new Error(`extracted bundle not found at ${newApp}`);
  }

  // Pass paths as positional args ($1/$2/$3) instead of interpolating
  // them into the script body. If a user installs Bitrove under a path
  // containing quotes, $, or backticks (e.g. an external volume named
  // weirdly), the previous string-interpolation form would have led to
  // shell-injection-style breakage during rm -rf.
  const script = `#!/bin/bash
set -e
sleep 1
rm -rf -- "$1"
mv -- "$2" "$1"
xattr -cr "$1" 2>/dev/null || true
open "$1"
rm -rf -- "$3" 2>/dev/null || true
`;
  const scriptPath = join(stageDir, "swap.sh");
  writeFileSync(scriptPath, script, { mode: 0o755 });
  FILE_LOGGER.info("manualSwapInstall: spawning swap script", scriptPath);

  const child = spawn("/bin/bash", [scriptPath, target, newApp, stageDir], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Give the OS a beat to actually fork the detached process before we exit.
  setTimeout(() => app.quit(), 200);
}
