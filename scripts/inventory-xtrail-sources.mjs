/**
 * Phase 0：盤點 XTRAIL ICE 素材目錄（副檔名統計、略過規則、樣本路徑）。
 * 用法：node scripts/inventory-xtrail-sources.mjs [--root=PATH]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const IGNORE_FRAGMENTS = ["~$", ".ds_store", "thumbs.db", "__macosx", ".git", "node_modules"];
const PARSEABLE = new Set([".xlsx", ".xls", ".pdf", ".pptx", ".ppt"]);
const REGISTER_ONLY = new Set([".csv", ".docx", ".doc", ".txt", ".md", ".png", ".jpg", ".jpeg"]);

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function shouldIgnore(rel) {
  const lower = rel.replace(/\\/g, "/").toLowerCase();
  return IGNORE_FRAGMENTS.some((f) => lower.includes(f.toLowerCase()));
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "(no_ext)";
}

function walk(dir, base, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full);
    if (shouldIgnore(rel)) continue;
    if (ent.isDirectory()) {
      walk(full, base, out);
    } else if (ent.isFile()) {
      const ext = extOf(ent.name);
      const st = fs.statSync(full);
      out.push({ relativePath: rel.replace(/\\/g, "/"), ext, size: st.size });
    }
  }
}

function resolveRoot() {
  const arg = process.argv.find((a) => a.startsWith("--root="));
  if (arg) return path.resolve(arg.slice("--root=".length));
  if (process.env.XTRAIL_ICE_SOURCE_ROOT) return path.resolve(process.env.XTRAIL_ICE_SOURCE_ROOT);
  return path.join(webRoot, "data", "xtrail-ice");
}

loadEnv();
const root = resolveRoot();

if (!fs.existsSync(root)) {
  console.log("素材根目錄不存在:", root);
  console.log("請設定 XTRAIL_ICE_SOURCE_ROOT 或將素材放入 web/data/xtrail-ice/");
  process.exit(0);
}

const files = [];
walk(root, root, files);

const byExt = {};
let parseable = 0;
let registerOnly = 0;
let unknown = 0;
let ignored = 0;

for (const f of files) {
  byExt[f.ext] = (byExt[f.ext] || 0) + 1;
  if (PARSEABLE.has(f.ext)) parseable += 1;
  else if (REGISTER_ONLY.has(f.ext)) registerOnly += 1;
  else unknown += 1;
}

const report = {
  scannedAt: new Date().toISOString(),
  root,
  totalFiles: files.length,
  parseableCount: parseable,
  registerOnlyCount: registerOnly,
  unknownExtensionCount: unknown,
  byExtension: Object.fromEntries(Object.entries(byExt).sort((a, b) => b[1] - a[1])),
  samplePaths: files.slice(0, 15).map((f) => f.relativePath),
  validationQuestions: [
    "XTRAIL 有什麼配備",
    "客戶擔心油耗",
    "跟競品比較",
    "試乘邀約話術",
    "價格優惠說明",
  ],
};

const outPath = path.join(webRoot, "data", "xtrail-ice-inventory.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
console.log("\n已寫入:", outPath);
