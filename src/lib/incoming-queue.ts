import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";

export type IncomingQueueStatus = "queued" | "active" | "done" | "discarded";

export type IncomingQueueItem = {
  id: string;
  fileName: string;
  uploadedAt: string;
  status: IncomingQueueStatus;
  /** 相對於 dataDir 的檔名，例如 {id}.xlsx */
  storedFile: string;
};

type QueueFile = {
  items: IncomingQueueItem[];
  activeId: string | null;
};

function dataRoot() {
  const root = process.env.INCOMING_QUEUE_DIR?.trim() || path.join(process.cwd(), ".data");
  return path.resolve(root);
}

function queueJsonPath() {
  return path.join(dataRoot(), "incoming-queue.json");
}

function incomingFilesDir() {
  return path.join(dataRoot(), "incoming-files");
}

function ensureDirs() {
  const root = dataRoot();
  const files = incomingFilesDir();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(files)) fs.mkdirSync(files, { recursive: true });
}

function readQueueFile(): QueueFile {
  ensureDirs();
  const p = queueJsonPath();
  if (!fs.existsSync(p)) {
    return { items: [], activeId: null };
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as QueueFile;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      activeId: parsed.activeId ?? null,
    };
  } catch {
    return { items: [], activeId: null };
  }
}

function writeQueueFile(q: QueueFile) {
  ensureDirs();
  fs.writeFileSync(queueJsonPath(), JSON.stringify(q, null, 2), "utf8");
}

export function listIncomingQueue(): IncomingQueueItem[] {
  return readQueueFile().items;
}

export function getStoredFileAbsolute(storedFile: string) {
  return path.join(incomingFilesDir(), path.basename(storedFile));
}

/** 將上傳檔寫入磁碟並加入佇列；可選設為目前使用中並回傳 id */
export function enqueueIncomingFile(
  buffer: Buffer,
  fileName: string,
  options?: { setActive?: boolean },
): IncomingQueueItem {
  ensureDirs();
  const id = randomUUID();
  const safeName = `${id}.xlsx`;
  const abs = path.join(incomingFilesDir(), safeName);
  fs.writeFileSync(abs, buffer);

  const item: IncomingQueueItem = {
    id,
    fileName: fileName || "uploaded.xlsx",
    uploadedAt: new Date().toISOString(),
    status: options?.setActive ? "active" : "queued",
    storedFile: safeName,
  };

  const q = readQueueFile();
  if (options?.setActive) {
    for (const it of q.items) {
      if (it.status === "active") it.status = "queued";
    }
    q.activeId = id;
  }
  q.items.push(item);
  writeQueueFile(q);
  return item;
}

export function selectIncomingQueueItem(id: string): { buffer: Buffer; item: IncomingQueueItem } {
  const q = readQueueFile();
  const item = q.items.find((x) => x.id === id);
  if (!item) throw new Error("找不到匯入項目");
  const abs = getStoredFileAbsolute(item.storedFile);
  if (!fs.existsSync(abs)) throw new Error("匯入檔案遺失，請重新上傳");
  for (const it of q.items) {
    if (it.status === "active") it.status = "queued";
  }
  item.status = "active";
  q.activeId = id;
  writeQueueFile(q);
  return { buffer: fs.readFileSync(abs), item };
}

export function markIncomingQueueStatus(id: string, status: "done" | "discarded") {
  const q = readQueueFile();
  const item = q.items.find((x) => x.id === id);
  if (!item) throw new Error("找不到匯入項目");
  item.status = status;
  if (q.activeId === id) q.activeId = null;
  writeQueueFile(q);
}

export function getActiveIncomingId(): string | null {
  return readQueueFile().activeId;
}

/** 讀取目前 active 項目檔案（不改變狀態）；若無 active 則 null */
export function readActiveIncomingBuffer(): { buffer: Buffer; item: IncomingQueueItem } | null {
  const q = readQueueFile();
  if (!q.activeId) return null;
  const item = q.items.find((x) => x.id === q.activeId);
  if (!item || item.status === "discarded") return null;
  const abs = getStoredFileAbsolute(item.storedFile);
  if (!fs.existsSync(abs)) return null;
  return { buffer: fs.readFileSync(abs), item };
}
