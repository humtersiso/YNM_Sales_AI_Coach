/**
 * 煙測：主題 localStorage + html data 屬性（預設櫻花／隱藏翠綠）
 * node scripts/smoke/portal-theme-smoke.mjs
 */
import assert from "node:assert/strict";

const KEY = "ynm-portal-theme";

function readTheme(doc) {
  return doc.documentElement.dataset.portalTheme === "default" ? "default" : "nissan";
}

function applyFromStorage(storage) {
  const t = storage.getItem(KEY);
  if (t === "default") {
    global.document.documentElement.dataset.portalTheme = "default";
  } else {
    delete global.document.documentElement.dataset.portalTheme;
  }
}

const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
global.document = {
  documentElement: { dataset: {} },
};

applyFromStorage(global.localStorage);
assert.equal(readTheme(global.document), "nissan");

global.localStorage.setItem(KEY, "nissan");
applyFromStorage(global.localStorage);
assert.equal(readTheme(global.document), "nissan");

global.localStorage.setItem(KEY, "default");
applyFromStorage(global.localStorage);
assert.equal(readTheme(global.document), "default");

console.log("portal-theme-smoke: OK");
