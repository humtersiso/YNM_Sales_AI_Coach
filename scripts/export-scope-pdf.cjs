/**
 * 將 docs/PROJECT_SCOPE_SALES_TRAINING.md 轉成同目錄 PDF（Playwright + marked）
 * 執行：npm run docs:pdf
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { marked } = require("marked");

const root = path.join(__dirname, "..");
const mdPath = path.join(root, "docs", "PROJECT_SCOPE_SALES_TRAINING.md");
const pdfPath = path.join(root, "docs", "PROJECT_SCOPE_SALES_TRAINING.pdf");
const docsDir = path.join(root, "docs");
const baseHref = pathToFileURL(path.join(docsDir, path.sep)).href;

const md = fs.readFileSync(mdPath, "utf8");
const body = marked.parse(md, { gfm: true });

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<base href="${baseHref}" />
<style>
  body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 0; }
  h1 { font-size: 18pt; border-bottom: 1px solid #0d9488; padding-bottom: 6px; }
  h2 { font-size: 13pt; margin-top: 1.2em; color: #115e59; }
  h3 { font-size: 11.5pt; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #ecfdf5; }
  code { background: #f4f4f5; padding: 1px 4px; font-size: 9pt; }
  pre { background: #f4f4f5; padding: 10px; font-size: 8.5pt; white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent; padding: 0; }
  a { color: #0f766e; }
  img { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid #e4e4e7; margin: 16px 0; }
</style>
</head>
<body>${body}</body>
</html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
  });
  await browser.close();
  console.log("PDF written:", pdfPath);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
