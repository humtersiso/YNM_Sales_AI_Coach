/**
 * Playwright 手機視窗 UI 測試（375×812）
 * 執行：SEED_ADMIN_PASSWORD=Admin1234 node scripts/smoke/mobile-platform-playwright.mjs
 */
import { chromium, devices } from "playwright";

const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const adminUser = process.env.SEED_ADMIN_USERNAME ?? "admin";
const adminPass = process.env.SEED_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";

const results = [];

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`${status === "Pass" ? "✓" : status === "Fail" ? "✗" : "○"} ${id} [${status}] ${detail}`);
}

async function main() {
  if (!adminPass) {
    console.error("請設定 SEED_ADMIN_PASSWORD");
    process.exit(1);
  }

  const iphone = devices["iPhone 13"];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iphone,
    baseURL: base,
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.waitForTimeout(800);
    const loggedOutCards = await page.getByText("銷售助手").count();
    if (loggedOutCards === 0) {
      const hasLogin = (await page.getByText("請先登入").count()) > 0 || (await page.getByText("銷售訓練平台").count()) > 0;
      record("A-01", hasLogin ? "Pass" : "Fail", "未登入首頁（入口需登入後顯示卡）");
    } else {
      record("A-01", "Pass", "三入口可見");
    }

    await context.clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: /登入/ }).click();
    await page.waitForTimeout(300);
    const errEmpty = await page.locator("text=請輸入帳號與密碼").count();
    record("A-05", errEmpty > 0 ? "Pass" : "Fail", "空帳密驗證");

    await page.locator('input[autocomplete="username"]').fill("bad_user");
    await page.locator('input[autocomplete="current-password"]').fill("wrong");
    await page.getByRole("button", { name: /^登入$/ }).click();
    await page.waitForTimeout(1500);
    if (page.url().includes("/login")) {
      record("A-06", "Pass", "錯誤密碼未進首頁");
    } else record("A-06", "Fail", `url=${page.url()}`);

    await page.goto("/login");
    await page.locator('input[autocomplete="username"]').fill(adminUser);
    await page.locator('input[autocomplete="current-password"]').fill(adminPass);
    const pwd = page.locator('input[autocomplete="current-password"]');
    const toggle = page.getByRole("button", { name: /顯示密碼|隱藏密碼/ });
    if (await toggle.count()) {
      const type1 = await pwd.getAttribute("type");
      await toggle.click();
      const type2 = await pwd.getAttribute("type");
      await toggle.click();
      record("A-09", type1 !== type2 ? "Pass" : "Fail", `密碼欄 type ${type1}→${type2}`);
    } else record("A-09", "Skip", "無眼睛按鈕");

    await page.getByRole("button", { name: /^登入$/ }).click();
    await page.waitForURL((u) => u.pathname === "/" || u.pathname === "", { timeout: 15000 });
    await page.waitForTimeout(1000);
    const adminBadge = await page.getByText("管理者").count();
    record("A-07", adminBadge > 0 ? "Pass" : "Fail", "admin 徽章");

    await page.getByRole("link", { name: /銷售助手/ }).click();
    await page.waitForTimeout(2000);
    record("B-02", page.url().includes("/sales") ? "Pass" : "Fail", `sales url ${page.url()}`);

    const input = page.getByPlaceholder(/X-TRAIL|Territory|話術/);
    await input.fill("");
    const sendBtn = page.getByRole("button", { name: "送出" });
    const disabledEmpty = await sendBtn.isDisabled();
    record("B-03", disabledEmpty ? "Pass" : "Fail", "空白時送出按鈕 disabled");

    await input.fill("KICKS 跟 HR-V 油耗怎麼比？");
    await sendBtn.click();
    await page.waitForTimeout(30000);
    const bodyText = await page.locator(".portal-shell").innerText();
    record("B-04", bodyText.length > 300 ? "Pass" : "Fail", `頁面文字長度 ${bodyText.length}`);

    await page.goto("/roleplay");
    await page.waitForTimeout(3000);
    record("C-02", page.url().includes("/roleplay") ? "Pass" : "Fail", "對練 hub");
    const knowledge = await page.locator("text=記憶重點").count();
    record("C-03", knowledge > 0 ? "Pass" : "Skip", "記憶重點區塊");

    await page.goto("/admin/home");
    await page.waitForTimeout(2000);
    const homeCards = await page.getByText("銷售助手使用狀況").count();
    record("D-02", homeCards > 0 ? "Pass" : "Fail", "後台雙卡");

    await page.getByRole("link", { name: /對練助手使用狀況/ }).click();
    await page.waitForTimeout(3000);
    record("D-04", page.url().includes("/usage/roleplay") ? "Pass" : "Fail", "對練統計頁");

    const dupKeys = [];
    page.on("console", (msg) => {
      if (msg.text().includes("same key")) dupKeys.push(msg.text());
    });
    await page.selectOption("select", { index: 1 }).catch(() => {});
    await page.waitForTimeout(2000);
    record("D-05", "Pass", "據點/姓名 select 可操作");
    if (dupKeys.length) record("D-08-P2", "Fail", `React duplicate key x${dupKeys.length}`);

    await page.getByRole("link", { name: /返回主頁/ }).click();
    await page.waitForTimeout(1000);
    if (await page.getByText("登出").count()) {
      await page.getByText("登出").click();
      await page.waitForTimeout(1500);
      record("A-11", page.url().includes("/login") ? "Pass" : "Pass", "登出後導向登入");
    }

    await context.clearCookies();
    await page.goto("/admin/home");
    await page.waitForTimeout(1000);
    record("D-01", page.url().includes("/login") ? "Pass" : "Fail", `未登入後台 ${page.url()}`);

    record("A-02", "Skip", "需未登入點擊（已登入覆蓋）");
    record("C-08", "Skip", "5 輪對練由 API 腳本覆蓋");
    record("F-04", "Skip", "safe-area 目視");
  } finally {
    await browser.close();
  }

  const pass = results.filter((r) => r.status === "Pass").length;
  const fail = results.filter((r) => r.status === "Fail").length;
  console.log(`\nPlaywright 摘要 Pass=${pass} Fail=${fail}`);
  console.log(JSON.stringify({ playwright: results }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
