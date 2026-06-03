import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = join(root, "docs", "images");
const htmlPath = join(root, "docs", "platform-feature-ownership.html");

const archFile = readdirSync(imagesDir).find((f) => f.endsWith(".PNG"));
if (!archFile) {
  console.error("找不到 docs/images/*.PNG");
  process.exit(1);
}

const imgPath = join(imagesDir, archFile);
const b64 = readFileSync(imgPath).toString("base64");
const dataUri = `data:image/png;base64,${b64}`;

let html = readFileSync(htmlPath, "utf8");
const imgRe =
  /<img class="arch-img" src="[^"]*" alt="銷售顧問智慧訓練系統架構圖" width="900" \/>/;
const replacement = `<img class="arch-img" src="${dataUri}" alt="銷售顧問智慧訓練系統架構圖" width="900" />`;

if (!imgRe.test(html)) {
  console.error("arch-img tag not found");
  process.exit(1);
}

html = html.replace(imgRe, replacement);
writeFileSync(htmlPath, html, "utf8");

console.log(`Embedded ${archFile} (${readFileSync(imgPath).length} bytes → ${b64.length} base64 chars)`);
console.log(`Updated ${htmlPath}`);
