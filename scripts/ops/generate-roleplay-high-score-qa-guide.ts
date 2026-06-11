/**
 * 產生競品高分對答指南（每競品 20 題 · 內容皆來自 Vertex RAG）
 * 用法：
 *   npm run docs:roleplay-score-guide          # 讀 data/roleplay-rag-playbook-snapshot.json
 *   npm run docs:roleplay-score-guide -- --live # 即時 Vertex 檢索（需 .env）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAllChaptersFromRag,
  MANIFEST,
  QA_SLOT_TOPIC_MAP,
  ROLEPLAY_SCENARIO_DIMENSIONS,
  type CompetitorChapter,
  type QA,
} from "./lib/roleplay-high-score-qa-core";
import { QA_TOPIC_LABELS } from "./lib/roleplay-high-score-qa-topics";
import {
  loadAllRagChapterInputs,
  SNAPSHOT_PATH,
  type RagLoadMode,
} from "./lib/roleplay-high-score-qa-rag-loader";
import { enrichChapterWithGemini } from "./lib/roleplay-high-score-qa-enrich";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(webRoot, "data/roleplay-high-score-qa");
const mdPath = path.join(webRoot, "docs/ROLEPLAY_HIGH_SCORE_QA_GUIDE.md");
const htmlPath = path.join(webRoot, "docs/ROLEPLAY_HIGH_SCORE_QA_GUIDE.html");
const publicHtmlPath = path.join(webRoot, "public/docs/ROLEPLAY_HIGH_SCORE_QA_GUIDE.html");

const mode: RagLoadMode = process.argv.includes("--live") ? "live" : "snapshot";
const withEnrich = process.argv.includes("--enrich");
const onlySlug = process.argv.find((a) => a.startsWith("--chapter="))?.slice(10);

async function main() {
const allRagInputs = await loadAllRagChapterInputs(mode);
if (onlySlug && !allRagInputs.some((r) => r.slug === onlySlug)) {
  console.error(`找不到章節 slug: ${onlySlug}`);
  process.exit(1);
}
let chapters = buildAllChaptersFromRag(allRagInputs);

if (withEnrich) {
  const enrichSlugs = onlySlug ? [onlySlug] : chapters.map((c) => c.slug);
  console.log(
    `Gemini 逐題 RAG 核對與詳解強化中…（${enrichSlugs.length} 章 × 20 題，請稍候）`,
  );
  const enriched: CompetitorChapter[] = [];
  for (const ch of chapters) {
    if (!enrichSlugs.includes(ch.slug)) {
      enriched.push(ch);
      continue;
    }
    const ragInput = allRagInputs.find((r) => r.slug === ch.slug);
    if (!ragInput) {
      enriched.push(ch);
      continue;
    }
    console.log(`Chapter ${ch.slug} (${ch.competitor})`);
    enriched.push(
      await enrichChapterWithGemini(ch, ragInput, {
        delayMs: 350,
        onProgress: (m) => console.log(m),
      }),
    );
  }
  chapters = enriched;
}
const totalQ = chapters.reduce((n, c) => n + c.questions.length, 0);
const ragExportedAt = allRagInputs.find((r) => r.ragExportedAt)?.ragExportedAt;

for (const ch of chapters) {
  if (ch.questions.length !== 20) {
    console.error(`ASSERT FAIL: ${ch.slug} has ${ch.questions.length} questions`);
    process.exit(1);
  }
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, "manifest.json"), JSON.stringify(MANIFEST, null, 2), "utf8");

for (const ch of chapters) {
  const fileName =
    MANIFEST.chapters.find((m) => m.slug === ch.slug)?.file ??
    `${ch.productLine}-${ch.slug}.json`;
  const payload = {
    slug: ch.slug,
    competitor: ch.competitor,
    short: ch.short,
    productLine: ch.productLine,
    product: ch.product,
    issue: ch.issue,
    themes: ch.themes,
    questions: ch.questions,
  };
  fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(payload, null, 2), "utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"');
}

function renderMdChapter(ch: CompetitorChapter): string {
  const lines = [
    `## ${ch.competitor}（20 題）`,
    "",
    `> 本品：${ch.product} · 主議題：${ch.issue}`,
    `> 涵蓋主題：${ch.themes.join("、")}`,
    "",
  ];
  for (const q of ch.questions) {
    lines.push(
      `### ${q.id} · 第 ${q.slot} 題`,
      "",
      `**標籤：** ${q.tags.join(" · ")}`,
      q.score ? `**評分：** ${q.score}` : "",
      "",
      `**客戶問：**`,
      "",
      q.q,
      "",
      `**挖空版高分答：**`,
      "",
      stripHtml(q.blank),
      "",
      `**完整詳解：**`,
      "",
      stripHtml(q.full),
      "",
      "---",
      "",
    );
  }
  return lines.filter((l) => l !== undefined).join("\n");
}

const generatedAt = new Date().toISOString().slice(0, 10);
const mdBody = [
  "# 競品對答高分指南（考試問答集 · RAG 驅動）",
  "",
  `產生日期：${generatedAt} · 共 **${totalQ}** 題（6 競品 × 20 題）`,
  "",
  `資料來源：**Vertex RAG**（模式 \`${mode}\`${ragExportedAt ? ` · snapshot ${ragExportedAt}` : ""}${withEnrich ? " · **Gemini 逐題詳解**" : ""}）`,
  "",
  "每競品 20 題涵蓋：開場、油耗、保養、隔音、盲操、空間、價格、安全、配備、策略、成交等議題（非僅油耗）。",
  "",
  "更新 RAG 快照：`npm run dump:roleplay-rag` · 產生：`npm run docs:roleplay-score-guide`",
  "",
  "---",
  "",
  ...chapters.map(renderMdChapter),
].join("\n");

fs.writeFileSync(mdPath, mdBody, "utf8");

function tagHtml(tags: string[]): string {
  return tags
    .slice(0, 4)
    .map((t) => {
      let cls = "tag-dim";
      if (t.startsWith("P-")) cls = "tag-persona";
      else if (/^R\d|開場|策略|地雷|成交|油耗|保養|隔音|盲操|空間|價格|安全|配備/.test(t)) cls = "tag-scenario";
      else if (t.includes("RAG")) cls = "tag-rag";
      return `<span class="tag ${cls}">${t}</span>`;
    })
    .join("");
}

function renderQa(qa: QA, chapterSlug: string): string {
  return `
  <article class="qa" data-id="${qa.id}" data-slot="${qa.slot}" data-chapter="${chapterSlug}" data-tags="${qa.tags.join(",")}">
    <div class="qa-head">
      <span class="qa-num">第 ${qa.slot} 題</span>
      <span class="qa-id">${qa.id}</span>
      ${tagHtml(qa.tags)}
    </div>
    <div class="qa-body">
      <p class="label label-q">客戶問</p>
      <div class="block-q">${qa.q}</div>
      <p class="label label-a">挖空版回答 <span class="exam-hint">（先自己想，再點顯示）</span></p>
      <div class="block-a-blank exam-answer">${qa.blank}</div>
      <p class="label label-full">完整詳解</p>
      <div class="block-a-full exam-detail">${qa.full}</div>
      ${qa.score ? `<p class="hint"><strong>評分重點：</strong>${qa.score}</p>` : ""}
    </div>
    <div class="qa-actions">
      <button type="button" class="btn btn-reveal-blank">顯示挖空答案</button>
      <button type="button" class="btn toggle-full">顯示詳解</button>
      <button type="button" class="btn btn-mark" title="標記已練習">✓ 已練</button>
    </div>
  </article>`;
}

function renderChapter(ch: CompetitorChapter): string {
  const sectionId = `ch-${ch.slug}`;
  const srcNote =
    ch.ragSources.length > 0
      ? `<p class="chapter-meta rag-src"><strong>RAG 來源：</strong>${ch.ragSources.slice(0, 4).join(" · ")}</p>`
      : "";
  return `
<section class="chapter" id="${sectionId}" data-chapter="${ch.slug}" data-filter="${ch.short}">
  <h2>${ch.competitor} <span class="count">（20 題）</span></h2>
  <p class="chapter-meta">本品 <strong>${ch.product}</strong> · 主議題 <strong>${ch.issue}</strong></p>
  <p class="chapter-meta">涵蓋主題：${ch.themes.join(" · ")} · 開場意向：${ch.hook}</p>
  ${srcNote}
  <nav class="q-jump" aria-label="${ch.competitor} 題號">
    ${ch.questions.map((q) => `<a href="#${q.id}" class="q-jump-link" data-slot="${q.slot}">${q.slot}</a>`).join("")}
  </nav>
  ${ch.questions.map((q) => renderQa(q, ch.slug)).join("")}
</section>`;
}

const filterButtons = chapters
  .map(
    (ch) =>
      `<button type="button" class="filter-btn" data-filter="${ch.slug}">${ch.short}</button>`,
  )
  .join("");

const tocItems = chapters
  .map((ch) => `<li><a href="#ch-${ch.slug}">${ch.competitor}（20）</a></li>`)
  .join("");

const matrixRows = chapters
  .map(
    (ch) =>
      `<tr><td>${ch.product}</td><td>${ch.competitor}</td><td>${ch.issue}</td><td>${ch.themes.slice(0, 4).join("、")}</td><td>20</td><td><a href="#ch-${ch.slug}">前往練習</a></td></tr>`,
  )
  .join("");

const slotTopicRows = QA_SLOT_TOPIC_MAP.map(
  (s) =>
    `<tr><td>${s.slot}</td><td>${QA_TOPIC_LABELS[s.topic]}</td><td>${s.tag}</td><td>各競品章節第 ${s.slot} 題</td></tr>`,
).join("");

const scenarioDimRows = ROLEPLAY_SCENARIO_DIMENSIONS.products
  .map(
    (p) =>
      `<tr><td>${p.name}</td><td>${p.qaChapters.join("、")}</td><td>選競品後對應章節 20 題</td></tr>`,
  )
  .join("");

const personaDimRows = ROLEPLAY_SCENARIO_DIMENSIONS.personas
  .map(
    (p) =>
      `<tr><td>${p.id} ${p.name}</td><td>${p.qaSlots.length ? `問答集第 ${p.qaSlots.join("、")} 題` : "融入各議題題幹"}</td></tr>`,
  )
  .join("");

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>對練助手 · 競品高分問答集（${totalQ} 題）</title>
<style>
:root{--bg:#f0f4f8;--card:#fff;--border:#cbd5e1;--text:#0f172a;--muted:#475569;--accent:#0369a1;--accent-light:#e0f2fe;--q-bg:#f0fdf4;--a-blank-bg:#fffbeb;--a-full-bg:#ecfdf5;--blank:#b45309;--blank-bg:#fef3c7;--exam:#7c3aed;--done:#059669}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:15px}
.wrap{max-width:1100px;margin:0 auto;padding:1.25rem 1rem 4rem}
h1{font-size:clamp(1.2rem,2.5vw,1.6rem);margin:0 0 .35rem}
h2{font-size:1.1rem;margin:0 0 .5rem;padding:.5rem .75rem;background:linear-gradient(90deg,#bae6fd,transparent);border-left:4px solid var(--accent);scroll-margin-top:6rem}
.count{font-size:.85rem;color:var(--muted);font-weight:normal}
.meta,.chapter-meta{color:var(--muted);font-size:.85rem;margin-bottom:.75rem}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0;position:sticky;top:0;z-index:30;background:var(--bg);padding:.6rem 0;border-bottom:1px solid var(--border)}
.btn{border:1px solid var(--border);background:var(--card);padding:.4rem .8rem;border-radius:8px;font-size:.85rem;cursor:pointer;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-exam{background:var(--exam);color:#fff;border-color:var(--exam)}
.btn-exam.active{box-shadow:0 0 0 2px #c4b5fd}
.filter-bar{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem}
.filter-btn{font-size:.78rem;padding:.25rem .6rem;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-family:inherit}
.filter-btn.active{background:#bae6fd;border-color:var(--accent);font-weight:600}
.layout{display:grid;grid-template-columns:minmax(180px,220px) minmax(0,1fr);gap:1rem;align-items:start}
@media(max-width:800px){.layout{grid-template-columns:1fr}}
.sidebar{position:sticky;top:5rem;max-height:calc(100vh - 6rem);overflow:auto}
.toc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.85rem;font-size:.82rem;margin-bottom:.75rem}
.toc ul{list-style:none;margin:.5rem 0 0;padding:0}
.toc li{margin:.3rem 0}
.toc a{color:var(--accent);text-decoration:none}
.progress-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.85rem;font-size:.82rem}
.progress-bar{height:8px;background:#e2e8f0;border-radius:4px;margin:.5rem 0;overflow:hidden}
.progress-fill{height:100%;background:var(--done);width:0%;transition:width .2s}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:1rem}
.chapter{margin-bottom:2rem}
.chapter.hidden{display:none}
.q-jump{display:flex;flex-wrap:wrap;gap:.25rem;margin-bottom:1rem}
.q-jump-link{display:inline-flex;align-items:center;justify-content:center;min-width:2rem;height:2rem;padding:0 .35rem;font-size:.75rem;border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--muted);background:#fff}
.q-jump-link:hover,.q-jump-link.active{background:var(--accent-light);color:var(--accent);border-color:var(--accent)}
.q-jump-link.done{background:#d1fae5;border-color:var(--done);color:#065f46}
.qa{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:1rem;overflow:hidden;scroll-margin-top:5.5rem}
.qa.hidden{display:none}
.qa.marked{border-color:var(--done);box-shadow:0 0 0 1px var(--done)}
.qa-head{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;padding:.55rem .85rem;background:var(--accent-light);border-bottom:1px solid var(--border);font-size:.78rem}
.qa-num{font-weight:700;color:var(--accent)}
.qa-id{color:var(--muted);font-size:.7rem}
.tag{padding:.08rem .4rem;border-radius:4px;font-size:.68rem;font-weight:600}
.tag-scenario{background:#dbeafe;color:#1e40af}
.tag-persona{background:#ede9fe;color:#5b21b6}
.tag-dim{background:#fef3c7;color:#92400e}
.tag-rag{background:#fce7f3;color:#9d174d}
.qa-body{padding:.85rem 1rem}
.label{font-size:.72rem;font-weight:700;margin-bottom:.25rem}
.label-q{color:#047857}.label-a{color:#b45309}.label-full{color:#0d9488}
.exam-hint{font-weight:normal;color:var(--muted);font-size:.68rem}
.block-q{background:var(--q-bg);border-left:3px solid #10b981;padding:.65rem .85rem;margin-bottom:.75rem;border-radius:0 6px 6px 0}
.block-a-blank,.block-a-full{border-left:3px solid #f59e0b;padding:.65rem .85rem;margin-bottom:.6rem;border-radius:0 6px 6px 0}
.block-a-blank{background:var(--a-blank-bg)}
.block-a-full{background:var(--a-full-bg);border-left-color:var(--accent);display:none}
.block-a-full.visible{display:block}
body.exam-mode .block-a-blank{filter:blur(6px);user-select:none;pointer-events:none}
body.exam-mode .block-a-blank.revealed{filter:none;user-select:text;pointer-events:auto}
body.exam-mode .block-a-full{display:none!important}
body.exam-mode .block-a-full.visible{display:block!important;filter:none}
.blank{color:var(--blank);background:var(--blank-bg);padding:0 .2rem;border-bottom:2px dashed #f59e0b;font-weight:600}
.blank.revealed{color:#065f46;background:#d1fae5;border-bottom-color:transparent}
.qa-actions{padding:0 1rem .85rem;display:flex;flex-wrap:wrap;gap:.35rem}
.btn-mark{font-size:.78rem}
.btn-mark.marked{background:#d1fae5;border-color:var(--done)}
.hint{font-size:.78rem;color:var(--muted)}
.matrix-table{width:100%;border-collapse:collapse;font-size:.82rem}
.matrix-table th,.matrix-table td{border:1px solid var(--border);padding:.4rem .5rem;text-align:left}
.matrix-table th{background:var(--accent-light)}
.exam-nav{display:none;gap:.5rem;margin-bottom:1rem}
body.exam-mode .exam-nav{display:flex}
.exam-counter{font-size:.85rem;color:var(--muted);align-self:center;margin-left:auto}
footer{margin-top:2rem;font-size:.8rem;color:var(--muted);text-align:center}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>對練助手 · 競品高分問答集（RAG 驅動 · 考試練習版）</h1>
<p class="meta">共 <strong>${totalQ}</strong> 題 · 高分答內容<strong>僅引用 Vertex RAG 佐證</strong>（模式 ${mode}${ragExportedAt ? ` · ${ragExportedAt}` : ""}）</p>
<p class="meta">更新：先 <code>npm run dump:roleplay-rag</code> 再 <code>npm run docs:roleplay-score-guide</code>；即時檢索加 <code>--live</code></p>
<p class="meta">相關：<a href="ROLEPLAY_HIGH_SCORE_PLAYBOOK.html">高分教戰手則</a> · <a href="ROLEPLAY_RAG_QA_DRILL.html">RAG QA 詳解</a> · <a href="/roleplay/setup">對練設定</a></p>
</header>
<div class="toolbar">
<button type="button" class="btn btn-primary" id="scrollTop">回到頂部</button>
<button type="button" class="btn btn-exam" id="examMode">考試模式</button>
<button type="button" class="btn" id="expandAll">全部展開詳解</button>
<button type="button" class="btn" id="collapseAll">全部收合</button>
<button type="button" class="btn" id="revealBlanks">顯示所有挖空</button>
<input type="search" id="searchBox" placeholder="搜尋題目關鍵字…" style="flex:1;min-width:140px;padding:.4rem .6rem;border:1px solid var(--border);border-radius:8px"/>
</div>
<div class="filter-bar" id="filterBar">
<button type="button" class="filter-btn active" data-filter="all">全部競品</button>
${filterButtons}
</div>
<div class="layout">
<aside class="sidebar">
<nav class="toc card"><strong>章節</strong><ul>${tocItems}</ul></nav>
<div class="progress-card">
<strong>練習進度</strong>
<div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
<p id="progressText">0 / ${totalQ} 題已標記</p>
</div>
</aside>
<main>
<div class="card">
<h3 style="margin-top:0">① 競品章節 ↔ 問答集（各 20 題 · 多議題）</h3>
<p class="meta">對練設定頁選「本品＋競品」→ 對應下方章節；每章 20 題涵蓋油耗、保養、隔音、操作、空間、價格、安全、配備等（答案來自 RAG）。</p>
<table class="matrix-table"><thead><tr><th>本品</th><th>競品</th><th>主議題</th><th>涵蓋主題</th><th>題數</th><th></th></tr></thead><tbody>${matrixRows}</tbody></table>
</div>
<div class="card">
<h3 style="margin-top:0">② 對練情境可組合維度</h3>
<table class="matrix-table"><thead><tr><th>本品</th><th>問答章節 slug</th><th>說明</th></tr></thead><tbody>${scenarioDimRows}</tbody></table>
<table class="matrix-table" style="margin-top:.75rem"><thead><tr><th>人設</th><th>問答集對應</th></tr></thead><tbody>${personaDimRows}</tbody></table>
<p class="meta">另可組合：年齡（20–30／30–40／40–50／50+）、難度（新手／進階／挑戰）、輪次 3–10。動態對練開場由 RAG 推斷主題；問答集為固定 20 題骨架＋RAG 填空。</p>
</div>
<div class="card">
<h3 style="margin-top:0">③ 每章 20 題 · 議題對照（6 章相同結構）</h3>
<table class="matrix-table"><thead><tr><th>題號</th><th>議題</th><th>標籤</th><th>說明</th></tr></thead><tbody>${slotTopicRows}</tbody></table>
</div>
<div class="exam-nav card">
<button type="button" class="btn" id="examPrev">← 上一題</button>
<button type="button" class="btn" id="examNext">下一題 →</button>
<span class="exam-counter" id="examCounter"></span>
</div>
${chapters.map(renderChapter).join("")}
<footer>產生：${generatedAt} · npm run docs:roleplay-score-guide</footer>
</main>
</div>
</div>
<script>
const STORAGE_KEY="roleplay-score-guide-done";
let examMode=false;
let examIndex=0;
let visibleQas=[];

function loadMarked(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");}catch{return[];}
}
function saveMarked(ids){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(ids));
  updateProgress();
}
function getMarkedSet(){return new Set(loadMarked());}

function updateVisibleQas(){
  visibleQas=[...document.querySelectorAll(".qa")].filter(el=>!el.classList.contains("hidden"));
  if(examIndex>=visibleQas.length)examIndex=Math.max(0,visibleQas.length-1);
  updateExamCounter();
}
function updateExamCounter(){
  const c=document.getElementById("examCounter");
  if(!c||!visibleQas.length){if(c)c.textContent="";return;}
  c.textContent=(examIndex+1)+" / "+visibleQas.length+" 題";
}
function applyExamMode(){
  document.body.classList.toggle("exam-mode",examMode);
  document.getElementById("examMode").classList.toggle("active",examMode);
  if(examMode){
    visibleQas.forEach((el,i)=>{el.style.display=i===examIndex?"":"none";});
    if(visibleQas[examIndex])visibleQas[examIndex].scrollIntoView({behavior:"smooth",block:"start"});
  }else{
    document.querySelectorAll(".qa").forEach(el=>{el.style.display="";});
  }
  updateExamCounter();
}
function syncMarkedUI(){
  const marked=getMarkedSet();
  document.querySelectorAll(".qa").forEach(el=>{
    const id=el.dataset.id;
    const on=marked.has(id);
    el.classList.toggle("marked",on);
    const btn=el.querySelector(".btn-mark");
    if(btn){btn.classList.toggle("marked",on);btn.textContent=on?"✓ 已練習":"✓ 已練";}
    const slot=el.dataset.slot;
    const ch=el.dataset.chapter;
    const jump=document.querySelector('.q-jump-link[data-slot="'+slot+'"]');
    if(jump&&el.closest("[data-chapter]")?.dataset.chapter===ch)jump.classList.toggle("done",on);
  });
  updateProgress();
}
function updateProgress(){
  const marked=getMarkedSet();
  const total=${totalQ};
  const n=marked.size;
  const pct=Math.round((n/total)*100);
  document.getElementById("progressFill").style.width=pct+"%";
  document.getElementById("progressText").textContent=n+" / "+total+" 題已標記";
}

document.querySelectorAll(".toggle-full").forEach(btn=>{
  btn.onclick=()=>{
    const f=btn.closest(".qa").querySelector(".block-a-full");
    const v=f.classList.toggle("visible");
    btn.textContent=v?"收合詳解":"顯示詳解";
  };
});
document.querySelectorAll(".btn-reveal-blank").forEach(btn=>{
  btn.onclick=()=>{
    const box=btn.closest(".qa").querySelector(".block-a-blank");
    box.classList.add("revealed");
    box.querySelectorAll(".blank").forEach(e=>{
      e.textContent=e.dataset.answer||"—";
      e.classList.add("revealed");
    });
    btn.textContent="已顯示挖空";
  };
});
document.querySelectorAll(".btn-mark").forEach(btn=>{
  btn.onclick=()=>{
    const el=btn.closest(".qa");
    const id=el.dataset.id;
    const marked=loadMarked();
    const i=marked.indexOf(id);
    if(i>=0)marked.splice(i,1);else marked.push(id);
    saveMarked(marked);
    syncMarkedUI();
  };
});
document.getElementById("expandAll").onclick=()=>{
  document.querySelectorAll(".block-a-full").forEach(e=>e.classList.add("visible"));
  document.querySelectorAll(".toggle-full").forEach(b=>b.textContent="收合詳解");
};
document.getElementById("collapseAll").onclick=()=>{
  document.querySelectorAll(".block-a-full").forEach(e=>e.classList.remove("visible"));
  document.querySelectorAll(".toggle-full").forEach(b=>b.textContent="顯示詳解");
};
document.getElementById("revealBlanks").onclick=()=>{
  document.querySelectorAll(".block-a-blank").forEach(box=>{
    box.classList.add("revealed");
    box.querySelectorAll(".blank").forEach(e=>{
      e.textContent=e.dataset.answer||"—";
      e.classList.add("revealed");
    });
  });
};
document.getElementById("scrollTop").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});
document.getElementById("examMode").onclick=()=>{
  examMode=!examMode;
  updateVisibleQas();
  applyExamMode();
};
document.getElementById("examPrev").onclick=()=>{
  if(!examMode)return;
  examIndex=Math.max(0,examIndex-1);
  applyExamMode();
};
document.getElementById("examNext").onclick=()=>{
  if(!examMode)return;
  examIndex=Math.min(visibleQas.length-1,examIndex+1);
  applyExamMode();
};
const searchBox=document.getElementById("searchBox");
searchBox.oninput=()=>{
  const q=searchBox.value.trim().toLowerCase();
  document.querySelectorAll(".qa").forEach(el=>{
    const t=el.textContent.toLowerCase();
    el.classList.toggle("hidden",q&&!t.includes(q));
  });
  updateVisibleQas();
  if(examMode)applyExamMode();
};
document.querySelectorAll(".filter-btn").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const f=btn.dataset.filter;
    document.querySelectorAll(".chapter").forEach(ch=>{
      if(f==="all"){ch.classList.remove("hidden");return;}
      ch.classList.toggle("hidden",ch.dataset.chapter!==f);
    });
    document.querySelectorAll(".qa").forEach(el=>{
      if(f==="all"){el.classList.remove("hidden");return;}
      el.classList.toggle("hidden",el.dataset.chapter!==f);
    });
    updateVisibleQas();
    examIndex=0;
    if(examMode)applyExamMode();
  };
});
syncMarkedUI();
updateVisibleQas();
</script>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf8");
fs.mkdirSync(path.dirname(publicHtmlPath), { recursive: true });
fs.writeFileSync(publicHtmlPath, html, "utf8");

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${publicHtmlPath}`);
console.log(`Mode: ${mode} · snapshot: ${SNAPSHOT_PATH}`);
console.log(`Total: ${totalQ} questions across ${chapters.length} chapters`);
for (const ch of chapters) {
  console.log(
    `  ${ch.competitor}: ${ch.questions.length} · RAG sources ${ch.ragSources.length}`,
  );
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
