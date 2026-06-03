/**
 * 盤點訓練素材（依車款子目錄統計）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const IGNORE = ["~$", ".ds_store", "thumbs.db", "__macosx", ".git", "node_modules"];

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
  return IGNORE.some((f) => lower.includes(f));
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "(no_ext)";
}

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full);
    if (shouldIgnore(rel)) continue;
    if (ent.isDirectory()) walk(full, base, out);
    else if (ent.isFile()) {
      out.push({ relativePath: rel.replace(/\\/g, "/"), ext: extOf(ent.name), size: fs.statSync(full).size });
    }
  }
}

function resolveRoot() {
  const arg = process.argv.find((a) => a.startsWith("--root="));
  if (arg) return path.resolve(arg.slice("--root=".length));
  if (process.env.TRAINING_MATERIALS_ROOT) return path.resolve(process.env.TRAINING_MATERIALS_ROOT);
  if (process.env.XTRAIL_ICE_SOURCE_ROOT) return path.resolve(process.env.XTRAIL_ICE_SOURCE_ROOT);
  return path.join(webRoot, "data", "training-materials");
}

loadEnv();
const root = resolveRoot();

if (!fs.existsSync(root)) {
  console.log("根目錄不存在:", root);
  console.log("請建立 data/training-materials/{車款}/ 或設定 TRAINING_MATERIALS_ROOT");
  process.exit(0);
}

const productLines = [];
const topDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
const scanRoots =
  topDirs.length > 0 && !process.argv.find((a) => a.startsWith("--root="))
    ? topDirs.map((d) => ({ line: d.name, path: path.join(root, d.name) }))
    : [{ line: path.basename(root), path: root }];

for (const { line, path: lineRoot } of scanRoots) {
  const files = [];
  walk(lineRoot, lineRoot, files);
  const byExt = {};
  for (const f of files) byExt[f.ext] = (byExt[f.ext] || 0) + 1;
  productLines.push({
    productLine: line,
    totalFiles: files.length,
    byExtension: byExt,
    samplePaths: files.slice(0, 5).map((f) => f.relativePath),
  });
}

const report = {
  scannedAt: new Date().toISOString(),
  materialsRoot: root,
  productLines,
};

const outPath = path.join(webRoot, "data", "training-materials-inventory.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("\n已寫入:", outPath);
