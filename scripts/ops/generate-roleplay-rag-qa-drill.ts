/**
 * RAG 驅動產生 docs/ROLEPLAY_RAG_QA_DRILL.html
 * 用法：tsx scripts/ops/generate-roleplay-rag-qa-drill.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLEPLAY_COMPETITORS_XTRAIL } from "../../src/lib/roleplay/catalog";
import { ROLEPLAY_PERSONA_IDS, ROLEPLAY_GLOBAL_CONFIG } from "../../src/lib/roleplay/seed/global-config";
import { fetchRoleplayRagContext } from "../../src/lib/roleplay/rag-context";
import type { RoleplaySessionConfig } from "../../src/lib/roleplay/scenario-contract";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = path.join(webRoot, "docs/ROLEPLAY_RAG_QA_DRILL.html");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
    break;
  }
}

loadEnv();

function B(answer: string) {
  const safe = String(answer).replace(/"/g, "&quot;");
  return `<span class="blank" data-answer="${safe}">＿＿＿</span>`;
}

type QA = {
  id: string;
  tags: string[];
  q: string;
  blank: string;
  full: string;
  score?: string;
};

let qaCounter = 0;
const ALL_QAS: QA[] = [];

function addQa(q: Omit<QA, "id"> & { id?: string }) {
  qaCounter += 1;
  ALL_QAS.push({ ...q, id: q.id ?? `Q${String(qaCounter).padStart(3, "0")}` });
}

function addMetaGuide() {
  addQa({
    tags: ["攻略", "RAG"],
    q: "【開練前】對練事實與追問從哪裡來？",
    blank: `先至 ${B("銷售助手")} 學習 → 對練時看 ${B("本場 RAG 佐證")} → 評分僅對齊該佐證。`,
    full: "先至銷售助手學習 → 對練時看本場 RAG 佐證 → 評分僅對齊該佐證。",
    score: "流程",
  });
  addQa({
    tags: ["攻略", "五維"],
    q: "【自我檢核】每一輪回覆的標準結構？",
    blank: `① ${B("承接疑慮")} → ② ${B("本場 RAG 事實")} → ③ ${B("本品差異")} → ④ ${B("試乘或試算邀約")}。`,
    full: "① 承接疑慮 → ② 本場 RAG 事實 → ③ 本品差異 → ④ 試乘或試算邀約。",
    score: "論點完整度",
  });
  addQa({
    tags: ["地雷", "禁止說法"],
    q: "「我保證一定比競品省油。」（業代若這樣說…）",
    blank: `【錯誤】${B("保證一定贏")}。正確：引用 ${B("本場佐證")}＋${B("試算")}，不保證實際。`,
    full: "【錯誤】保證一定贏。正確：引用本場佐證＋試算，不保證實際。",
    score: "factCheck 扣分",
  });
}

async function addRagDrivenQas() {
  const product = "X-TRAIL ICE";
  for (const competitor of ROLEPLAY_COMPETITORS_XTRAIL) {
    for (const personaId of ROLEPLAY_PERSONA_IDS) {
      const config: RoleplaySessionConfig = {
        productLine: "xtrail-ice",
        personaId,
        ageRange: "30-40",
        competitor,
        maxTurns: 5,
        difficulty: "advanced",
      };
      const rag = await fetchRoleplayRagContext(config);
      if (!rag.coverageOk) continue;

      const persona = ROLEPLAY_GLOBAL_CONFIG.personas.find((p) => p.id === personaId);
      const shortComp = competitor.replace(/Toyota |Honda |Hyundai |Mitsubishi |KIA /i, "");

      for (const fact of rag.facts.slice(0, 4)) {
        const topic = fact.label.slice(0, 24);
        addQa({
          tags: [product, shortComp, personaId, "RAG"],
          q: `「我在比 ${product} 跟 ${shortComp}，想先了解${topic}這塊。」`,
          blank: `承接疑慮 → 引用佐證：${B(fact.value.slice(0, 40))} → ${B("不超出 RAG")} → ${B("試乘/試算")}。`,
          full: `承接疑慮 → 引用佐證：${fact.value.slice(0, 80)} → 不超出 RAG → 試乘/試算。`,
          score: persona ? `人設 ${persona.name}` : "factCheck",
        });
      }

      if (rag.facts[0]) {
        addQa({
          tags: [product, shortComp, personaId, "RAG", "開場"],
          q: `【${persona?.name ?? personaId}】「${competitor} 跟 ${product}，${rag.facts[0].label} 你們怎麼說？」`,
          blank: `${B("同理")} → ${B(rag.facts[0].label)}：${B(rag.facts[0].value.slice(0, 30))} → ${B("試乘邀約")}。`,
          full: `同理 → ${rag.facts[0].label}：${rag.facts[0].value.slice(0, 60)} → 試乘邀約。`,
        });
      }
    }
  }
}

function renderQa(qa: QA) {
  const tags = qa.tags
    .slice(0, 5)
    .map((t) => `<span class="tag tag-dim">${t}</span>`)
    .join("");
  return `
  <article class="qa" data-id="${qa.id}" data-tags="${qa.tags.join(",")}">
    <div class="qa-head"><span class="qa-num">${qa.id}</span>${tags}</div>
    <div class="qa-body">
      <p class="label label-q">客戶問</p><div class="block-q">${qa.q}</div>
      <p class="label label-a">挖空版回答</p><div class="block-a-blank">${qa.blank}</div>
      <p class="label label-full">完整詳解</p><div class="block-a-full">${qa.full}</div>
      ${qa.score ? `<p class="hint"><strong>評分重點：</strong>${qa.score}</p>` : ""}
    </div>
    <div class="qa-actions"><button type="button" class="btn toggle-full">顯示詳解</button></div>
  </article>`;
}

async function main() {
  addMetaGuide();
  await addRagDrivenQas();

  const ragQas = ALL_QAS.filter((q) => q.tags.includes("RAG"));
  const metaQas = ALL_QAS.filter((q) => !q.tags.includes("RAG"));

  const html = `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>對練助手 · RAG QA 詳解（${ALL_QAS.length} 題）</title>
<style>
:root{--bg:#f8faf9;--card:#fff;--border:#d1e7dd;--text:#064e3b;--accent:#0d9488}
body{margin:0;font-family:"Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.7}
.wrap{max-width:960px;margin:0 auto;padding:1.5rem 1.25rem 4rem}
h1{font-size:1.4rem}.meta{color:#3d6b5c;font-size:.9rem}
.qa{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:1rem;overflow:hidden}
.qa-head{padding:.55rem .85rem;background:#ecfdf5;border-bottom:1px solid var(--border);font-size:.78rem}
.qa-num{font-weight:700;color:var(--accent)}.tag{margin-right:.35rem;padding:.08rem .4rem;border-radius:4px;background:#fef3c7;font-size:.7rem}
.block-q,.block-a-blank,.block-a-full{padding:.65rem .85rem;margin:.5rem .85rem;border-left:3px solid #10b981;background:#f0fdf4}
.block-a-blank{border-color:#f59e0b;background:#fffbeb}.block-a-full{display:none;border-color:var(--accent);background:#ecfdf5}
.block-a-full.visible{display:block}.blank{border-bottom:2px dashed #f59e0b;background:#fef3c7}
.btn{border:1px solid var(--border);background:#fff;padding:.4rem .8rem;border-radius:8px;cursor:pointer;margin:0 .85rem .85rem}
</style></head><body><div class="wrap">
<h1>對練助手 · RAG 驅動 QA 詳解</h1>
<p class="meta">共 ${ALL_QAS.length} 題（攻略 ${metaQas.length} · RAG 自動產生 ${ragQas.length}）· 產生：${new Date().toISOString().slice(0, 10)}</p>
<p class="meta">題目僅來自 Vertex RAG 可檢索內容；請先跑 <code>npm run audit:roleplay-rag</code> 確認覆蓋率。</p>
<h2>攻略與地雷</h2>${metaQas.map(renderQa).join("")}
<h2>RAG 情境題（依競品×人設×佐證自動產生）</h2>${ragQas.map(renderQa).join("")}
</div>
<script>
document.querySelectorAll(".toggle-full").forEach(btn=>{btn.onclick=()=>{const f=btn.closest(".qa").querySelector(".block-a-full");const v=f.classList.toggle("visible");btn.textContent=v?"收合詳解":"顯示詳解";}});
</script></body></html>`;

  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Total: ${ALL_QAS.length} (RAG: ${ragQas.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
