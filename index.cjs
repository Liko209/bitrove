"use strict";
const electron = require("electron");
const bitrove = {
  pickFolder: () => electron.ipcRenderer.invoke("dialog:pickFolder"),
  getServicesState: () => electron.ipcRenderer.invoke("services:state"),
  openExternal: (url) => electron.ipcRenderer.invoke("shell:openExternal", url),
  openInFinder: (path) => electron.ipcRenderer.invoke("shell:openInFinder", path),
  onServicesUpdate: (cb) => {
    const handler = (_e, s) => cb(s);
    electron.ipcRenderer.on("services:update", handler);
    return () => electron.ipcRenderer.off("services:update", handler);
  },
  // Setup / first-run
  listModels: () => electron.ipcRenderer.invoke("setup:listModels"),
  downloadModel: (id) => electron.ipcRenderer.invoke("setup:downloadModel", id),
  pauseModel: (id) => electron.ipcRenderer.invoke("setup:pauseModel", id),
  cancelModel: (id) => electron.ipcRenderer.invoke("setup:cancelModel", id),
  isSetupReady: () => electron.ipcRenderer.invoke("setup:isReady"),
  autodetectSources: () => electron.ipcRenderer.invoke("setup:autodetectSources"),
  readConfig: () => electron.ipcRenderer.invoke("setup:readConfig"),
  writeConfig: (partial) => electron.ipcRenderer.invoke("setup:writeConfig", partial),
  startServices: () => electron.ipcRenderer.invoke("setup:startServices"),
  // Updater
  updaterGetState: () => electron.ipcRenderer.invoke("updater:state"),
  updaterCheck: () => electron.ipcRenderer.invoke("updater:check"),
  updaterDownload: () => electron.ipcRenderer.invoke("updater:download"),
  updaterInstall: () => electron.ipcRenderer.invoke("updater:install"),
  onUpdaterUpdate: (cb) => {
    const handler = (_e, s) => cb(s);
    electron.ipcRenderer.on("updater:update", handler);
    return () => electron.ipcRenderer.off("updater:update", handler);
  },
  onModelsUpdate: (cb) => {
    const handler = (_e, s) => cb(s);
    electron.ipcRenderer.on("setup:update", handler);
    return () => electron.ipcRenderer.off("setup:update", handler);
  }
};
electron.contextBridge.exposeInMainWorld("bitrove", bitrove);
