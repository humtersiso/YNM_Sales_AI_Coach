import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export function loadRoleplaySkill(filename: string): string {
  if (cache.has(filename)) return cache.get(filename)!;
  const filePath = path.join(process.cwd(), "src/lib/roleplay/skills", filename);
  try {
    const text = fs.readFileSync(filePath, "utf8").trim();
    cache.set(filename, text);
    return text;
  } catch {
    return "";
  }
}
