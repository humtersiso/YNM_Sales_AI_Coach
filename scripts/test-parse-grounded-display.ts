/**
 * 驗證 grounded 回覆不會「正文 + 列點」重複
 * 執行：npm run test:parse-grounded
 */
import { parseGroundedReplyDisplay } from "../src/lib/gemini/reply-format";

const morningXforce = `XFORCE 的特色在於針對日常駕駛情境進行引擎與變速箱調校，強調起步與中速域的輕快反應，並具備優異的油耗表現 [2][3][4]。

建議可強調 XFORCE 搭載 AYC 主動式彎道動態控制系統，透過控制左右車輪驅動力，提升過彎穩定性與精準度 [1][5]。
重點在於其空間配置，後座膝部空間較競品多出約 4.2 公分 [1][5]。
可回覆客戶 XFORCE 採用 105ps 馬力引擎，內部測試油耗數據為 17 km/l [1][3][4]。`;

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
  assertCase("morning-style", morningXforce, /XFORCE 的特色/, 3) && allOk;
allOk =
  assertCase("markdown", markdownBullets, /XFORCE 主打/, 3) && allOk;

process.exit(allOk ? 0 : 1);
