import fs from "fs";
import path from "path";

const MAIN_FILENAME = "AI話術演練表.xlsx";
const INCOMING_FILENAME = "Demo話術演練資料.xlsx";

function resolveByEnvOrDefault(envKey: string, defaultName: string): string | null {
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv);
  }
  const parentDir = path.resolve(process.cwd(), "..");
  const full = path.join(parentDir, defaultName);
  if (fs.existsSync(full)) return full;
  return null;
}

export function resolveMainWorkbookPath(): string {
  const byPriority =
    resolveByEnvOrDefault("EXCEL_MAIN_PATH", MAIN_FILENAME) ??
    resolveByEnvOrDefault("EXCEL_SOURCE_PATH", MAIN_FILENAME);
  if (byPriority) return byPriority;

  const parentDir = path.resolve(process.cwd(), "..");
  throw new Error(`找不到主庫 Excel：${path.join(parentDir, MAIN_FILENAME)}，請設定 EXCEL_MAIN_PATH`);
}

export function resolveIncomingWorkbookPath(): string {
  const byPriority = resolveByEnvOrDefault("EXCEL_INCOMING_PATH", INCOMING_FILENAME);
  if (byPriority) return byPriority;

  const parentDir = path.resolve(process.cwd(), "..");
  throw new Error(`找不到待比對 Excel：${path.join(parentDir, INCOMING_FILENAME)}，請設定 EXCEL_INCOMING_PATH`);
}

// 相容舊版呼叫端（預設回主庫）
export function resolveWorkbookPath(): string {
  return resolveMainWorkbookPath();
}

export function resolveAnyWorkbookPathFallback(): string {
  const parentDir = path.resolve(process.cwd(), "..");
  let files: string[];
  try {
    files = fs.readdirSync(parentDir);
  } catch {
    throw new Error(`無法讀取目錄：${parentDir}`);
  }

  const candidates = files.filter(
    (name) => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"),
  );
  if (candidates.length === 0) {
    throw new Error(
      `在 ${parentDir} 找不到任何 .xlsx。請放入 ${MAIN_FILENAME}/${INCOMING_FILENAME}，或設定 EXCEL_MAIN_PATH`,
    );
  }

  const preferred =
    candidates.find((n) => n.includes("話術")) ??
    candidates.find((n) => !n.includes("備份")) ??
    candidates[0];

  return path.join(parentDir, preferred);
}
