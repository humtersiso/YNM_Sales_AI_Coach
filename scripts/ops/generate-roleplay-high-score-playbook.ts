/**
 * 產生 docs/ROLEPLAY_HIGH_SCORE_PLAYBOOK.html
 * 用法：tsx scripts/ops/generate-roleplay-high-score-playbook.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mdPath = path.join(webRoot, "docs/ROLEPLAY_HIGH_SCORE_PLAYBOOK.md");
const outPath = path.join(webRoot, "docs/ROLEPLAY_HIGH_SCORE_PLAYBOOK.html");

function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 64) || "section";
}

function extractToc(md: string): { level: number; text: string; id: string }[] {
  const items: { level: number; text: string; id: string }[] = [];
  const used = new Map<string, number>();
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const level = m[1]!.length;
    const text = m[2]!.trim();
    let id = slugify(text);
    const n = (used.get(id) ?? 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    items.push({ level, text, id });
  }
  return items;
}

function buildHtml(body: string, toc: { level: number; text: string; id: string }[], generatedAt: string) {
  const tocHtml = toc
    .map((item) => {
      const pad = item.level === 3 ? " toc-sub" : "";
      return `<li class="${pad}"><a href="#${item.id}">${item.text}</a></li>`;
    })
    .join("\n");

  const competitorFilters = [
    "全部",
    "RAV4",
    "CR-V",
    "Tucson",
    "Outlander",
    "Sportage",
    "人設",
    "地雷",
  ];

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>對練助手 · 高分教戰手則（RAG 優先版）</title>
<style>
:root{--bg:#f8faf9;--card:#fff;--border:#d1e7dd;--text:#064e3b;--muted:#3d6b5c;--accent:#0d9488;--accent-light:#ecfdf5;--warn:#b45309;--warn-bg:#fffbeb}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.75;font-size:15px;width:100%;min-height:100vh}
.wrap{width:100%;max-width:100%;margin:0;padding:1rem clamp(1rem,2.5vw,2rem) 3rem}
header{margin-bottom:1rem}
h1{font-size:clamp(1.25rem,2.5vw,1.55rem);margin:0 0 .35rem;line-height:1.35}
.meta{color:var(--muted);font-size:.88rem;margin:.25rem 0}
.meta a{color:var(--accent)}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0;position:sticky;top:0;z-index:20;background:var(--bg);padding:.65rem 0;border-bottom:1px solid var(--border);width:100%}
.btn{border:1px solid var(--border);background:var(--card);padding:.4rem .85rem;border-radius:8px;font-size:.85rem;cursor:pointer;font-family:inherit;text-decoration:none;color:var(--text);display:inline-block}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.filter-bar{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem;width:100%}
.filter-btn{font-size:.75rem;padding:.22rem .55rem;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-family:inherit}
.filter-btn.active{background:#d1fae5;border-color:#10b981}
.layout{display:grid;grid-template-columns:minmax(200px,280px) minmax(0,1fr);gap:clamp(.75rem,2vw,1.5rem);align-items:start;width:100%}
@media(max-width:800px){.layout{grid-template-columns:1fr}}
.toc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;position:sticky;top:4.5rem;max-height:calc(100vh - 5.5rem);overflow:auto;font-size:.82rem;width:100%}
.toc h2{font-size:.95rem;margin:0 0 .5rem;color:var(--accent)}
.toc ul{list-style:none;margin:0;padding:0}
.toc li{margin:.25rem 0}
.toc li.toc-sub{padding-left:.85rem}
.toc a{color:var(--muted);text-decoration:none}
.toc a:hover{color:var(--accent)}
.content{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:clamp(1rem,2vw,1.5rem) clamp(1rem,2.5vw,2rem) 2rem;width:100%;min-width:0}
.content h2{font-size:1.15rem;margin:2rem 0 .75rem;padding:.45rem .65rem;background:linear-gradient(90deg,#d1fae5,transparent);border-left:4px solid var(--accent);scroll-margin-top:5rem}
.content h2:first-child{margin-top:0}
.content h3{font-size:1rem;margin:1.5rem 0 .5rem;color:#047857;scroll-margin-top:5rem}
.content blockquote{margin:.75rem 0;padding:.65rem 1rem;border-left:4px solid var(--accent);background:var(--accent-light);border-radius:0 8px 8px 0;color:#065f46}
.content pre{background:#1e293b;color:#e2e8f0;padding:.85rem 1rem;border-radius:8px;overflow:auto;font-size:.85rem;line-height:1.5}
.content code{font-family:Consolas,monospace;font-size:.88em;background:#ecfdf5;padding:.1rem .35rem;border-radius:4px}
.content pre code{background:none;padding:0;color:inherit}
.content table{width:100%;border-collapse:collapse;font-size:.88rem;margin:.75rem 0 1rem}
.content th,.content td{border:1px solid var(--border);padding:.45rem .55rem;text-align:left;vertical-align:top}
.content th{background:var(--accent-light);font-weight:600}
.content ul,.content ol{padding-left:1.35rem;margin:.5rem 0 1rem}
.content li{margin:.25rem 0}
.content hr{border:none;border-top:1px dashed var(--border);margin:1.5rem 0}
.content p{margin:.65rem 0}
.content strong{color:#065f46}
.content .section-hidden{display:none}
.highlight-warn{background:var(--warn-bg);border:1px solid #fcd34d;border-radius:8px;padding:.65rem .85rem;margin:.75rem 0;font-size:.9rem}
footer{margin-top:1.5rem;font-size:.8rem;color:var(--muted);text-align:center}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>對練助手 · 高分教戰手則（RAG 優先版）</h1>
<p class="meta">產生日期：${generatedAt} · 來源 <code>docs/ROLEPLAY_HIGH_SCORE_PLAYBOOK.md</code></p>
<p class="meta">相關：<a href="ROLEPLAY_RAG_QA_DRILL.html">RAG QA 詳解</a> · <a href="ROLEPLAY_RAG_COVERAGE_AUDIT.html">RAG 覆蓋率稽核</a></p>
</header>
<div class="toolbar">
<button type="button" class="btn btn-primary" id="scrollTop">回到頂部</button>
<a class="btn" href="/sales" target="_blank" rel="noopener">開啟銷售助手</a>
<a class="btn" href="/roleplay/setup" target="_blank" rel="noopener">對練設定</a>
</div>
<div class="filter-bar" id="filterBar">
${competitorFilters
  .map(
    (f, i) =>
      `<button type="button" class="filter-btn${i === 0 ? " active" : ""}" data-filter="${f === "全部" ? "all" : f}">${f}</button>`,
  )
  .join("\n")}
</div>
<div class="layout">
<nav class="toc" aria-label="目錄">
<h2>目錄</h2>
<ul>${tocHtml}</ul>
</nav>
<main class="content" id="mainContent">${body}</main>
</div>
<footer>對練事實與評分依當次 Vertex RAG；請先在銷售助手預習，演練畫面不顯示佐證。</footer>
</div>
<script>
(function(){
  const content = document.getElementById("mainContent");
  const headings = content.querySelectorAll("h2, h3");
  const tocLinks = document.querySelectorAll(".toc a");
  const slugUsed = {};
  headings.forEach((h) => {
    let id = (h.textContent || "").trim().replace(/[^\\w\\u4e00-\\u9fff]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 64);
    slugUsed[id] = (slugUsed[id] || 0) + 1;
    if (slugUsed[id] > 1) id = id + "-" + slugUsed[id];
    h.id = id;
  });
  tocLinks.forEach((a) => {
    const t = a.textContent.trim();
    const target = [...headings].find((h) => h.textContent.trim() === t);
    if (target && target.id) a.href = "#" + target.id;
  });
  document.getElementById("scrollTop").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const filters = document.querySelectorAll(".filter-btn");
  filters.forEach((btn) => {
    btn.onclick = () => {
      filters.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const f = btn.dataset.filter;
      headings.forEach((h) => {
        if (h.tagName !== "H2") return;
        const section = h;
        let el = section.nextElementSibling;
        const block = [section];
        while (el && el.tagName !== "H2") { block.push(el); el = el.nextElementSibling; }
        const text = block.map((n) => n.textContent || "").join(" ");
        const show = f === "all" || text.includes(f) || (f === "人設" && text.includes("P-0")) || (f === "地雷" && text.includes("禁止"));
        block.forEach((n) => n.classList.toggle("section-hidden", !show));
      });
    };
  });
})();
</script>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(mdPath)) {
    console.error("Missing:", mdPath);
    process.exit(1);
  }

  const md = fs.readFileSync(mdPath, "utf8");
  const toc = extractToc(md);
  const ids = new Map<string, number>();

  marked.use({
    gfm: true,
    breaks: false,
  });

  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }) => {
    const plain = text.replace(/<[^>]+>/g, "");
    let id = slugify(plain);
    const n = (ids.get(id) ?? 0) + 1;
    ids.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  let body = marked.parse(md, { renderer }) as string;
  // 頁首已有 h1，移除 markdown 第一個標題避免重複
  body = body.replace(/^<h1[^>]*>[\s\S]*?<\/h1>\s*/, "");

  const generatedAt = new Date().toISOString().slice(0, 10);
  const html = buildHtml(body, toc, generatedAt);

  fs.writeFileSync(outPath, html, "utf8");
  const publicDir = path.join(webRoot, "public/docs");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(outPath, path.join(publicDir, "ROLEPLAY_HIGH_SCORE_PLAYBOOK.html"));
  console.log(`Wrote ${outPath}`);
  console.log(`Copied to public/docs/ROLEPLAY_HIGH_SCORE_PLAYBOOK.html`);
}

main();
