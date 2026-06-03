import fs from "fs";
import path from "path";

const MAIN_FILENAME = "AI話術演練表.xlsx";
const INCOMING_FILENAME = "Demo話術演練資料.xlsx";

/** 本機話術 Excel 預設目錄（見 web/data/README.md） */
export function getDataDir(): string {
  return path.resolve(process.cwd(), "data");
}

function resolveByEnvOrDefault(envKey: string, defaultName: string): string | null {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv);
  }
  const dataDir = getDataDir();
  const inData = path.join(dataDir, defaultName);
  if (fs.existsSync(inData)) return inData;
  const legacyParent = path.join(path.resolve(process.cwd(), ".."), defaultName);
  if (fs.existsSync(legacyParent)) return legacyParent;
  return null;
}

export function resolveMainWorkbookPath(): string {
  const byPriority =
    resolveByEnvOrDefault("EXCEL_MAIN_PATH", MAIN_FILENAME) ??
    resolveByEnvOrDefault("EXCEL_SOURCE_PATH", MAIN_FILENAME);
  if (byPriority) return byPriority;

  throw new Error(
    `找不到主庫 Excel：${path.join(getDataDir(), MAIN_FILENAME)}，請放入 web/data/ 或設定 EXCEL_MAIN_PATH`,
  );
}

export function resolveIncomingWorkbookPath(): string {
  const byPriority = resolveByEnvOrDefault("EXCEL_INCOMING_PATH", INCOMING_FILENAME);
  if (byPriority) return byPriority;

  throw new Error(
    `找不到待比對 Excel：${path.join(getDataDir(), INCOMING_FILENAME)}，請放入 web/data/ 或設定 EXCEL_INCOMING_PATH`,
  );
}

export function resolveWorkbookPath(): string {
  return resolveMainWorkbookPath();
}

export function resolveAnyWorkbookPathFallback(): string {
  const dirs = [getDataDir(), path.resolve(process.cwd(), "..")];
  for (const dir of dirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const candidates = files.filter(
      (name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"),
    );
    if (candidates.length === 0) continue;

    const preferred =
      candidates.find((n) => n.includes("話術")) ??
      candidates.find((n) => !n.includes("備份")) ??
      candidates[0];

    return path.join(dir, preferred);
  }

  throw new Error(
    `找不到任何 .xlsx。請放入 web/data/${MAIN_FILENAME} 或設定 EXCEL_MAIN_PATH`,
  );
}
