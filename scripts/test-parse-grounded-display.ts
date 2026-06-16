/**
 * 驗證 grounded 回覆不會「正文 + 列點」重複
 * 執行：npm run test:parse-grounded
 */
import {
  finalizeGroundedClientReply,
  formatGroundedReplyForLog,
  isTruncatedGroundedBullet,
  parseGroundedReplyDisplay,
  polishGroundedSalesReply,
  polishSalesReply,
} from "../src/lib/gemini/reply-format";

const morningXforce = `XFORCE 的特色在於針對日常駕駛情境進行引擎與變速箱調校，強調起步與中速域的輕快反應，並具備優異的油耗表現 [2][3][4]。

建議可強調 XFORCE 搭載 AYC 主動式彎道動態控制系統，透過控制左右車輪驅動力，提升過彎穩定性與精準度 [1][5]。
重點在於其空間配置，後座膝部空間較競品多出約 4.2 公分 [1][5]。
可回覆客戶 XFORCE 採用 105ps 馬力引擎，內部測試油耗數據為 17 km/l [1][3][4]。`;

/** 對齊 grounded-full-2026-06-03T07-45-18 reg-03（intro 後多一行話術 + • 列點） */
const log0745Reg03 = `XFORCE 主打日常駕駛情境的加速輕快感與空間配置，並強調搭載 AYC 主動式彎道動態控制系統 [1][5]。
重點在於競品強調 1.5L 自然進氣引擎的日常加速反應，若客戶提及此點，可引導對比 X-TRAIL ICE。

• 強調搭載 AYC 主動式彎道動態控制系統 [1][5]
• 可回覆客戶，競品雖宣稱透過 AYC 系統提升過彎穩定性 [5]，但 X-TRAIL ICE 同樣具備高度競爭力`;

const markdownBullets = `XFORCE 主打空間機能、全速域 Level 2 駕駛輔助系統及針對日常市區駕駛調校的動力表現。

- 可強調空間機能：XFORCE 強調車室寬度 1458mm
- 可說明動力調校：該車款引擎經日本團隊特別調校
- 可提及科技配置：配備 12.3 吋影音主機`;

function assertCase(name: string, raw: string, expectIntro: RegExp, expectBullets: number) {
  const r = parseGroundedReplyDisplay(raw);
  let ok = true;
  if (!expectIntro.test(r.intro)) {
    console.error(`FAIL [${name}]: intro 不符`, r.intro);
    ok = false;
  }
  if (r.intro.includes("可強調") && expectBullets > 0) {
    console.error(`FAIL [${name}]: intro 不應含列點內容`);
    ok = false;
  }
  if (r.bullets.length !== expectBullets) {
    console.error(`FAIL [${name}]: 應有 ${expectBullets} 則列點，得到`, r.bullets.length);
    ok = false;
  }
  if (ok) console.log(`OK [${name}] intro + ${r.bullets.length} bullets`);
  return ok;
}

let allOk = true;
allOk =
  assertCase("morning-style", morningXforce, /XFORCE 的特色/, 4) && allOk;
allOk =
  assertCase("markdown", markdownBullets, /XFORCE 主打/, 3) && allOk;
allOk =
  assertCase("log-0745-reg03", log0745Reg03, /XFORCE 主打日常/, 3) && allOk;
if (parseGroundedReplyDisplay(log0745Reg03).intro.includes("重點在於競品")) {
  console.error("FAIL [log-0745-reg03]: intro 不應含第二行話術");
  allOk = false;
}

const client = finalizeGroundedClientReply(log0745Reg03, 5);
const logText = formatGroundedReplyForLog(client.intro, client.bullets);
if (client.bullets.some((b) => /競品雖$/.test(b))) {
  console.error("FAIL: 不應保留截斷列點「競品雖」");
  allOk = false;
}
if (!logText.includes("小結") || !logText.includes("列點")) {
  console.error("FAIL: log 格式應含 小結 / 列點 區塊");
  allOk = false;
} else if (/\[\d{1,2}\]/.test(logText)) {
  console.error("FAIL: log 不應含句內 [n] 標記");
  allOk = false;
} else {
  console.log("OK [client=log format] bullets:", client.bullets.length);
}

const longConjunctionBullet =
  `${"X-TRAIL ICE 在日常駕駛具備輕快加速與優異油耗，".repeat(4)}並搭載 AYC 主動式彎道動態控制系統提升過彎穩定性，且後座膝部空間較競品多出約 4.2 公分`;
const polished = polishGroundedSalesReply("", [longConjunctionBullet]);
if (polished.bullets.some((b) => /，並$/.test(b) || /並…$/.test(b))) {
  console.error("FAIL [trim-grounded]: 不應在「並」前截斷");
  allOk = false;
} else {
  console.log("OK [trim-grounded] 連接詞前不截斷");
}
if (!isTruncatedGroundedBullet("可回覆客戶空間較大，並")) {
  console.error("FAIL [truncated-detect]: 應偵測「，並」殘句");
  allOk = false;
} else {
  console.log("OK [truncated-detect] 連接詞殘句");
}

const commaEndingBullet =
  "強調每個人對聲音與音頻的感受各異，應親自確認異音是否真的影響行車，並可參考專業測試影片，";
if (!isTruncatedGroundedBullet(commaEndingBullet)) {
  console.error("FAIL [comma-ending-detect]: 應偵測以「影片，」結尾的殘句");
  allOk = false;
} else {
  console.log("OK [comma-ending-detect] 逗號結尾殘句");
}
if (polishGroundedSalesReply("", [commaEndingBullet]).bullets.length > 0) {
  console.error("FAIL [comma-ending-filter]: 以逗號結尾列點應被過濾");
  allOk = false;
} else {
  console.log("OK [comma-ending-filter] 逗號結尾列點已過濾");
}
if (polishSalesReply("", [commaEndingBullet]).bullets.length > 0) {
  console.error("FAIL [comma-ending-filter-sales]: polishSalesReply 應過濾逗號結尾列點");
  allOk = false;
} else {
  console.log("OK [comma-ending-filter-sales] polishSalesReply 已過濾");
}

const longNoCommaTrunc =
  `${"強調每個人對聲音與音頻的感受各異，".repeat(8)}並可參考專業測試影片完成確認。`;
const trimmedLong = polishGroundedSalesReply("", [longNoCommaTrunc]);
if (trimmedLong.bullets.some((b) => /[，,、]$/.test(b))) {
  console.error("FAIL [no-comma-trunc]: 超長列點不應在逗號處截斷");
  allOk = false;
} else {
  console.log("OK [no-comma-trunc] 僅在句號處截斷");
}

process.exit(allOk ? 0 : 1);
