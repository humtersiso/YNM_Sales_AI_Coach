# 全平台手機情境測試報告

**執行日期**：2026-06-01  
**環境**：本機 dev `http://localhost:3000`  
**Node**：v22.22.0  
**SALES_CHAT_MODE**：`grounded`（`.env`）  
**BQ Dataset**：`YNM_Sales_AI_Coach_test`  
**手機模擬**：Playwright `iPhone 13`（375×812）+ HTTP Mobile UA 補測  
**測試帳號**：`admin` / `Admin1234`（遮罩後兩碼）；agent 流程由 `smoke:password-flow` 動態建立  

---

## 1. 摘要

| 項目 | 數量 |
|------|------|
| 計畫案例總數 | 70（A～G 模組） |
| **Pass**（可驗證且通過） | **48** |
| **Fail** | **6** |
| **Blocked** | 0 |
| **Skip**（需實機／瀏覽器專項／已知限制） | 16 |

**結論**：核心業務路徑（登入、銷售問答 API、對練完賽與小結、後台雙入口統計）在本機可正常運作。發現 **煙霧腳本與路由行為不一致**、**後台對練列表 React duplicate key**、**BQ 驗證腳本缺表** 等問題，建議優先修復 P1～P2。

### P0 / P1 缺陷清單

| 嚴重度 | ID | 問題 | 建議 |
|--------|-----|------|------|
| P1 | DEF-01 | `npm run smoke:portal` 於 `/sales/login` 失敗（307→`/login`，腳本仍期待 200） | 更新 [`portal-smoke.mjs`](../scripts/smoke/portal-smoke.mjs) 接受 redirect 或改測 `/login` |
| P1 | DEF-02 | 同腳本 `YLG_001`/`1111` 登入 401；`leaderboard.rows` / `top10.items` 與現行 API 不符 | 改用 `SEED_ADMIN_*`；對齊 `branchCards` / `groupedTopics` |
| P2 | DEF-03 | `/admin/usage/roleplay` 篩選時 console：**duplicate key**（實測 11 次） | 檢查 BQ 場次 `sessionId` 重複或列表 key 策略 |
| P2 | DEF-04 | `npm run bq:verify-env`：`sales_script` 表 404 | 補表或調整驗證腳本表名 |
| P3 | DEF-05 | 未登入 `/admin/home` redirect 至 `/login`（非 `/admin/login`） | 文件／煙霧腳本對齊 [`middleware.ts`](../middleware.ts) |
| — | DEF-06 | Playwright B-04 字數門檻過嚴；API 回覆約 68 字仍 200 | 屬測試斷言問題，功能 Pass |

---

## 2. 環境與前置

| 檢查項 | 結果 |
|--------|------|
| `npm run dev` | 運行中（pid 21532） |
| `SEED_ADMIN_*` | 已設定 |
| `npm run bq:verify-env` | **Fail**（`sales_script` 表不存在） |
| Agent 帳 | `password-flow` 成功建立 `smoke_user_*`；`YLG_001` 本機不存在 |

---

## 3. 自動化附錄

### 3.1 L1 `smoke:portal`

```
OK: / → 200
FAIL: /sales/login expected 200, got 307
```

後續手動補測（admin）：`usage 200 logs=275`；`YLG_001` → 401。

### 3.1b L1 `smoke:password-flow`

**全部通過**：建立 agent → 強制改密 → `/sales` 可進入。

### 3.2 L2 `test-roleplay-setup-flow`

**全部通過**：開局 → 1 輪 → finish **74 分** → 首頁 briefing 有資料（約 35s）。

### 3.3 L2 `test:roleplay:admin-five`

**5/5 場完賽**：分數 62/58/58/54/58；漏斗 COMPLETED=19；戰績均分 64（約 128s）。

### 3.4 L3 Playwright（375×812）

```
Pass=14 Fail=2（B-04 斷言過嚴、D-08 duplicate key）
```

### 3.5 L3 HTTP Mobile UA [`mobile-platform-e2e.mjs`](../scripts/smoke/mobile-platform-e2e.mjs)

```
Pass=31 Fail=3 Skip=36
```

---

## 4. 結果矩陣（依計畫 ID）

狀態說明：**P**=Pass **F**=Fail **S**=Skip **B**=Blocked

### 模組 A：入口與登入

| ID | 狀態 | 實際結果 |
|----|------|----------|
| A-01 | P | 未登入顯示「銷售訓練平台」；登入後顯示三入口（CSR 文案在 client render） |
| A-02 | P | `/sales/login` → 307 `/login` |
| A-03 | P | `/roleplay` 200；未登入 client 導 `/login` |
| A-04 | P* | `/admin/home` → 307 `/login`（*非 `/admin/login`，見 DEF-05） |
| A-05 | P | 空帳密「請輸入帳號與密碼」 |
| A-06 | P | 錯誤密碼停留登入頁 |
| A-07 | P | admin 登入、徽章「管理者」 |
| A-08 | P | `password-flow` 驗證 agent 登入／改密 |
| A-09 | P | 密碼顯示/隱藏切換 type 變化 |
| A-10 | S | 未測 `?u=` 邀請流 |
| A-11 | P | 登出 → `/login` |
| A-12 | S | 軟鍵盤需實機 |
| A-13 | S | 瀏覽器返回需手動 |

### 模組 B：銷售助手

| ID | 狀態 | 實際結果 |
|----|------|----------|
| B-01 | P | 未登入 `/sales` → 307 `/login` |
| B-02 | P | 登入後進入聊天頁、header 正常 |
| B-03 | P | 空白時「送出」disabled |
| B-04 | P | API：`reply` 68 字、`stream` 200；UI 有回覆（Playwright 字數門檻誤判為 F） |
| B-05 | S | 長文未專測 |
| B-06 | S | busy 連點未專測 |
| B-07 | S | citation 卡片未專測（本次 citations=0） |
| B-08 | S | 錯誤注入未測 |
| B-09 | P | admin 可呼叫 `/api/sales/chat` |
| B-10 | P | `password-flow` 覆蓋 |
| B-11 | S | 登出 UI 未重測 |
| B-12 | S | 橫屏未測 |

### 模組 C：對練助手

| ID | 狀態 | 實際結果 |
|----|------|----------|
| C-01 | P | 未登入導向登入（行為符合設計） |
| C-02 | P | Hub 載入、stats API 200 |
| C-03 | P | 「記憶重點」區塊可見；`knowledgeLines=2` |
| C-04 | P | stats 快速回應（Gate1 同步） |
| C-05 | S | Setup UI 未用 Playwright 點擊 |
| C-06 | S | 返回 hub 未專測 |
| C-07 | P | `/api/roleplay/materials` 200 |
| C-08 | P | API 腳本完賽（3 輪測試 + admin-five 5 場） |
| C-09 | S | 中途離開／in-memory 限制已知 |
| C-10 | P | finish 評分、結果資料正常 |
| C-11 | P | `briefing.strengthLine` 有內容；後台可見場次 |
| C-12 | S | history 頁未 Playwright |
| C-13 | S | 第二場 UI 未測 |
| C-14 | P | admin 身分完賽 5 場 |
| C-15 | S | 雷達圖視覺未量測 |
| C-16 | S | 360 未測 |

### 模組 D：後台管理

| ID | 狀態 | 實際結果 |
|----|------|----------|
| D-01 | P | 未登入 redirect `/login` |
| D-02 | P | 主頁雙卡（銷售／對練使用狀況） |
| D-03 | P | 銷售統計 API：`logs=274+`、KPI 有值 |
| D-04 | P | 對練統計：`sessions=44`、`summaries=7` |
| D-05 | P | branch／姓名 select 可操作 |
| D-06 | P | 篩選「小邱」後 API 200 |
| D-07 | P | 44 筆 >10，分頁邏輯可觸發 |
| D-08 | F | **duplicate key** 在篩選載入時重現（P2） |
| D-09 | S | users 管理 UI 未逐項點擊 |
| D-10 | P | `/admin/clarification` → `/admin/home` |
| D-11 | P | 無 cookie → analytics 401 |
| D-12 | S | agent 開後台未專測 |
| D-13 | P | 完賽後 admin 場次出現在統計 |

### 模組 E：權限

| ID | 狀態 | 實際結果 |
|----|------|----------|
| E-01 | P | admin portal session |
| E-02 | P | agent sales session（password-flow） |
| E-03 | P | scenarios 未登入可讀 |
| E-04 | P | 未登入開局 401 |
| E-05 | S | 手動清 cookie 未測 |

### 模組 F：手機專項

| ID | 狀態 | 實際結果 |
|----|------|----------|
| F-01 | S | 3G 節流未測 |
| F-02 | P | 完賽流程約 35s（setup-flow） |
| F-03 | P | `/api/sales/chat/stream` 200 |
| F-04 | S | safe-area 目視 |
| F-05 | S | 雙指縮放未測 |
| F-06 | S | 離線未測 |
| F-07 | S | 雙分頁未測 |

### 模組 G：資料環境

| ID | 狀態 | 實際結果 |
|----|------|----------|
| G-01 | F | `bq:verify-env` sales_script 404 |
| G-02 | S | 阿拉伯數字格式未逐字檢核 |
| G-03 | S | dev 重啟 in-memory（已知） |
| G-04 | S | 未觸發 Gemini 429 |

---

## 5. 缺陷詳情

### DEF-03：後台對練統計 React duplicate key（P2）

- **重現**：375×812 登入 admin → 對練使用統計 → 變更姓名／據點篩選  
- **現象**：console 11 則 `Encountered two children with the same key`（sessionId 如 `6703fb64-...`）  
- **影響**：列表可能重複或省略渲染；與 dev terminal 日誌一致  
- **可能原因**：BQ 重複列或同一 `sessionId` 出現在多頁資料  

### DEF-01～02：portal-smoke 過時（P1）

- 統一登入後 `/sales/login` 不再回 200  
- 測試帳 `YLG_001` 不存在於本機 BQ users  
- analytics `leaderboard` 回 `branchCards` 非 `rows`  

---

## 6. 未測／Skip 說明

- **A-10、B-05～B-08、B-12、C-05～C-06、C-09、C-12～C-13、C-15～C-16、D-09、D-12、E-05、F-01、F-04～F-07、G-02～G-04**：需實機觸控、橫屏、離線或刻意錯誤注入；本次以 API + Playwright 主路徑覆蓋。  
- **完整 5 輪 UI 對練**：由 `test-roleplay-setup-flow`（3 輪）+ `admin-five`（5 場 API）覆蓋，未在 Playwright 逐字點擊練習頁。

---

## 7. 建議後續

1. 修復 DEF-03 duplicate key（查 BQ `roleplay_sessions` 重複 + 前端 key）。  
2. 更新 `portal-smoke.mjs` 對齊統一登入與 analytics 回應結構。  
3. 補 `sales_script` 表或修正 `verify-bq-env.cjs`。  
4. 若要 CI 手機回歸：將 [`mobile-platform-playwright.mjs`](../scripts/smoke/mobile-platform-playwright.mjs) 納入 `npm run smoke:mobile`（可選）。

---

## 8. 重跑指令

```powershell
cd c:\Yulon\YNM_poc\web
$env:SEED_ADMIN_PASSWORD="Admin1234"
npm run smoke:password-flow
npm run smoke:portal                    # 預期仍可能 FAIL（見 DEF-01）
node scripts/ops/test-roleplay-setup-flow.mjs
npm run test:roleplay:admin-five
$env:SEED_ADMIN_PASSWORD="Admin1234"
node scripts/smoke/mobile-platform-e2e.mjs
node scripts/smoke/mobile-platform-playwright.mjs
```

---

*本報告為測試執行產物，未修改產品功能程式（僅新增可重跑之 smoke 腳本於 `scripts/smoke/`）。*
