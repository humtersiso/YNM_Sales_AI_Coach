/**
 * 行動原型 Playwright E2E（需 dev server）
 * 執行：node scripts/portal-e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";

function ok(msg) {
  console.log("E2E OK:", msg);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
  });
  const page = await context.newPage();

  await page.goto(`${base}/`);
  await page.getByRole("heading", { name: "銷售訓練平台" }).waitFor();
  await page.getByRole("link", { name: /銷售助手/ }).click();
  await page.waitForURL("**/sales/login");
  ok("入口 → 銷售助手登入");

  await page.getByLabel("業代姓名").fill("測試業代");
  await page.getByLabel("密碼").fill("1234");
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL("**/sales");
  await page.getByRole("heading", { name: "銷售助手" }).waitFor();
  ok("銷售假登入 → 聊天頁");

  await page.getByPlaceholder(/輸入客戶問題/).fill("KICKS 油耗");
  await page.getByRole("button", { name: "送出" }).click();
  await page.getByText(/思考中|話術|回覆|設定|收到/).first().waitFor({ timeout: 30000 });
  ok("銷售聊天送出並收到回覆");

  await page.goto(`${base}/roleplay`);
  await page.getByRole("heading", { name: "對練助手準備中" }).waitFor();
  await page.getByRole("link", { name: "返回首頁" }).click();
  await page.waitForURL(`${base}/`);
  ok("對練待開發頁 → 返回首頁");

  await page.goto(`${base}/`);
  await page.getByRole("link", { name: /後台管理/ }).click();
  await page.waitForURL("**/admin/login");
  await page.getByLabel("帳號").fill("YLG_001");
  await page.getByLabel("密碼").fill("1111");
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL("**/admin/home");
  await page.getByRole("heading", { name: "主頁儀表板" }).waitFor();
  ok("後台登入 → 主頁");

  await page.getByRole("button", { name: "戰力排行" }).click();
  await page.getByText("陳雅婷").waitFor();
  ok("主頁戰力排行");

  await page.getByRole("button", { name: "競品 Top10" }).click();
  await page.getByText("HR-V").first().waitFor();
  ok("主頁競品 Top10");

  await page.getByRole("link", { name: "匯入與檢查" }).click();
  await page.waitForURL("**/admin/inbox");
  ok("側欄 → 匯入與檢查");

  await browser.close();
  console.log("\nE2E 全部通過。");
}

main().catch((e) => {
  console.error("E2E FAIL:", e);
  process.exit(1);
});
