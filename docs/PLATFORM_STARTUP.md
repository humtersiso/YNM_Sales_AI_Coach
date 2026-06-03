# 銷售訓練平台 — 啟動說明（本機開發）

本文件說明如何在本機啟動 **YNM 銷售顧問智慧訓練** Web 平台，並完成 **Google Cloud（BigQuery、Gemini Data Analytics）** 權限與環境設定。

| 項目 | 說明 |
|------|------|
| 應用程式目錄 | `web/`（Next.js 16） |
| 預設開發網址 | http://localhost:3000 |
| 相關技術文件 | [GEMINI_BQ_DATA_PATH.md](./GEMINI_BQ_DATA_PATH.md)、[BQ_INGEST_POC.md](./BQ_INGEST_POC.md) |

---

## 一、平台有哪些入口？

啟動後開啟 http://localhost:3000 ，會看到三個入口：

| 入口 | 路徑 | 說明 | 登入方式 |
|------|------|------|----------|
| 銷售助手 | `/sales/login` → `/sales` | 話術問答（後端查 **BigQuery**） | 由後台「用戶管理」建立業代帳號後登入 |
| 對練助手 | `/roleplay` | 情境演練（待開發佔位） | 無需 GCP |
| 後台管理 | `/admin/login` → `/admin/home` | 總覽、匯入檢查、釐清、法務等 | 先執行 `npm run seed:admin` 建立第一個管理員 |

**資料來源分工（重要）**

- **銷售助手、後台「資料總覽」**：以 **BigQuery 話術表** 為主（必設 GCP）。
- **後台「問題釐清／法務／專家維護」等流程**：仍使用 **Excel 主庫** 載入記憶體（需準備 `AI話術演練表.xlsx` 等檔案，與 BQ 可並行存在）。

---

## 二、本機環境需求

| 項目 | 建議版本 |
|------|----------|
| Node.js | **20.x 或以上**（建議 LTS） |
| npm | 隨 Node 安裝即可 |
| 作業系統 | Windows / macOS / Linux |
| 瀏覽器 | Chrome 或 Edge（最新版） |
| Google Cloud | 已建立專案，且帳號或服務帳號具下列權限（見第四節） |
| （建議）Google Cloud SDK | 本機用 `gcloud auth application-default login` 時需要 |

檢查 Node 版本：

```powershell
node -v
npm -v
```

---

## 三、取得程式碼並安裝依賴

```powershell
cd c:\Yulon\YNM_poc\web
npm install
```

複製環境變數範本（**勿將含金鑰的 `.env` 提交至版控**）：

```powershell
copy .env.example .env
```

用編輯器開啟 `web\.env`，依第四～五節填入實際值。

---

## 四、GCP 前置作業（雲端管理員／專案 Owner）

以下步驟需在 **裕日 GCP 專案**（或 PoC 專案）完成。開發者若無權限，請將「專案 ID、Dataset 名稱、服務帳號 JSON」向管理員申請。

### 步驟 4.1 — 確認專案與計費

1. 登入 [Google Cloud Console](https://console.cloud.google.com/)。
2. 選定專案，記下 **專案 ID**（例如 `your-gcp-project`）。
3. 確認專案已啟用計費（BigQuery 與 Gemini API 會產生費用）。

### 步驟 4.2 — 啟用必要 API

在 **API 和服務 → 資料庫** 啟用（名稱以 Console 顯示為準）：

| API | 用途 |
|-----|------|
| **BigQuery API** | 話術匯入、查詢、銷售助手檢索 |
| **Gemini Data Analytics API**（`geminidataanalytics.googleapis.com`） | 僅在 `SALES_CHAT_MODE=gemini` 時需要；預設 `bq-fast` 可不啟用 |

或用 gcloud（需已安裝並登入）：

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable bigquery.googleapis.com
gcloud services enable geminidataanalytics.googleapis.com
```

### 步驟 4.3 — 建立 BigQuery Dataset 與話術表

1. 開啟 **BigQuery → 建立資料集**，例如：
   - 資料集 ID：`YNM_Sales_AI_Coach_test`（或團隊約定名稱）
   - 位置：建議 `asia-east1` 或與專案政策一致
2. 執行 DDL 建立表：
   - 話術表：[`web/sql/script_drills_staging.sql`](../sql/script_drills_staging.sql)
   - 權限與登入：[`web/sql/platform_users.sql`](../sql/platform_users.sql)、[`web/sql/usage_events.sql`](../sql/usage_events.sql)、[`web/sql/auth_audit_log.sql`](../sql/auth_audit_log.sql)
   - 將 `YOUR_PROJECT`、`YOUR_DATASET` 替換為實際值後，在 BigQuery **查詢編輯器** 執行
3. 若正式環境表名與預設不同（例如含空白 `sales script`），請與 `.env` 的 `BIGQUERY_TABLE_SCRIPT_DRILLS` **完全一致**（含大小寫、空白）。

**驗證**：在 Console 對該表執行：

```sql
SELECT COUNT(*) AS n FROM `YOUR_PROJECT.YOUR_DATASET.YOUR_TABLE`;
```

有資料列後，銷售助手才有機會命中話術。

### 步驟 4.3-1 — 建立 test/prod 雙 Dataset（同 Project）

本專案目前採：

- **test**：`YNM_Sales_AI_Coach_test`
- **prod**：`YNM_Sales_AI_Coach_prod`

一鍵建立 prod dataset + 四張表（`sales script`、`platform_users`、`usage_events`、`auth_audit_log`）：

```powershell
cd c:\Yulon\YNM_poc\web
npm run bq:create-prod
```

若需要把 test 現有資料完整複製到 prod：

```powershell
cd c:\Yulon\YNM_poc\web
npm run bq:migrate:test-to-prod
```

驗證兩邊筆數：

```powershell
cd c:\Yulon\YNM_poc\web
npm run bq:verify-env
```

### 步驟 4.4 — 建立服務帳號與 IAM 權限

建議建立專用服務帳號，例如：`ynm-sales-poc@YOUR_PROJECT.iam.gserviceaccount.com`。

**專案層級（建議）**

| 角色（IAM Role） | 用途 |
|------------------|------|
| `roles/bigquery.jobUser` | 執行查詢工作 |
| `roles/serviceusage.serviceUsageConsumer` | 呼叫已啟用的 Google API |

**資料集層級**（在該 Dataset → 權限 新增主體為服務帳號）

| 角色 | 用途 |
|------|------|
| `roles/bigquery.dataEditor` | 讀寫話術表（匯入 API 需要寫入；查詢需要讀取） |

若僅查詢、不匯入，可改為 `roles/bigquery.dataViewer`。

**Gemini Data Analytics（選用）**

僅當要使用 Data Agent 潤飾回答時：

- 在 Console 建立 **Data Agent**，記下 **Agent ID** 與 **Location**
- 服務帳號需具備呼叫 `geminidataanalytics.googleapis.com` 的權限（常見為專案內 **Gemini / Analytics 相關使用者角色**，實際角色名稱依貴司 GCP 組織政策為準；不確定時請雲端管理員對照 Data Agent 文件指派）
- 程式使用 OAuth 範圍：`https://www.googleapis.com/auth/cloud-platform`

**最小權限原則**：PoC 可先僅開 Dataset 的 `dataEditor` + 專案 `jobUser`；正式上線前再由資安覆核。

### 步驟 4.5 — 本機 Google 認證（二選一）

**方式 A — 開發者帳號 ADC（適合個人本機）**

```powershell
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

不需下載 JSON；`.env` 可不設 `GOOGLE_APPLICATION_CREDENTIALS`（前提是登入帳號對 BQ 有讀寫權）。

**方式 B — 服務帳號 JSON（適合 CI／共用機）**

1. Console → IAM → 服務帳號 → 金鑰 → 建立 JSON
2. 存到安全路徑，例如 `C:\secrets\ynm-poc-sa.json`（**勿放入 git**）
3. 在 `.env` 設定：

```env
GOOGLE_APPLICATION_CREDENTIALS=C:\secrets\ynm-poc-sa.json
```

---

## 五、設定 `web/.env`

以下為**必填與常用**變數。完整說明見 [`.env.example`](../.env.example)。

### 5.1 BigQuery（必填 — 銷售助手與後台總覽）

```env
BIGQUERY_PROJECT_ID=your-gcp-project-id
BIGQUERY_DATASET=YNM_Sales_AI_Coach_test
BIGQUERY_TABLE_SCRIPT_DRILLS=script_drills_staging
```

也可用 `GOOGLE_CLOUD_PROJECT` 取代 `BIGQUERY_PROJECT_ID`（二擇一即可）。

### 5.2 認證

```env
# 方式 B 才需要；方式 A 可省略
# GOOGLE_APPLICATION_CREDENTIALS=C:\secrets\ynm-poc-sa.json
```

### 5.3 銷售助手模式

```env
# 預設（建議）：BQ 精準檢索 → Gemini 摘要成短列點；失敗則本地摘要
SALES_CHAT_MODE=agent
GEMINI_API_KEY=your-valid-api-key
# GEMINI_MODEL=gemini-3.1-flash-lite

# 僅本地摘要（不呼叫 Gemini）
# SALES_CHAT_MODE=agent          # Function Calling（預設，建議上線）
# SALES_CHAT_MODE=hybrid
# SALES_CHAT_MODE=bq-fast

# 全權交給 Data Agent 查 BQ（可能出現表格，不建議前台預設）
# SALES_CHAT_MODE=data-agent
# GEMINI_DATA_ANALYTICS_PROJECT=your-gcp-project-id
# GEMINI_DATA_ANALYTICS_LOCATION=global
# GEMINI_DATA_ANALYTICS_AGENT_ID=your-data-agent-id
# GEMINI_DATA_AGENT_THINKING_MODE=FAST
# ※ Agent 須指向與 BIGQUERY_DATASET 相同的 dataset（例：YNM_Sales_AI_Coach_test）
```

### 5.4 知識檢索後端（RAG / BQ）

銷售助手檢索層可切換，**回答層**（`SALES_CHAT_MODE`、Gemini 摘要）不變。

| `SALES_KNOWLEDGE_BACKEND` | 行為 |
|---------------------------|------|
| `rag`（程式預設） | Vertex AI Search（Agent Search）三語料庫：`RAG_DATASTORE_*` |
| `bq` | 既有 BigQuery `v_sales_knowledge` SQL 檢索 |

```env
SALES_KNOWLEDGE_BACKEND=rag
RAG_PROJECT_ID=gen-lang-client-0927009312
RAG_LOCATION=global
RAG_DATASTORE_SALES_SCRIPT=projects/.../dataStores/...   # 話術 QA
RAG_DATASTORE_COMPETITOR=projects/.../dataStores/...     # 競品
RAG_DATASTORE_PRODUCT=projects/.../dataStores/...      # 本品
```

- 認證：**ADC**（`gcloud auth application-default login`），組織政策通常禁用 API Key。
- Cloud Run 服務帳號需 `discoveryengine.servingConfigs.search`（建議 `roles/discoveryengine.viewer`）。
- 語料庫須為 **CONTENT_REQUIRED**（文件／話術），勿使用僅「網站搜尋」且未索引成功的 `PUBLIC_WEBSITE` store。
- 本機建立三庫並匯入訓練素材：

```bash
cd web
npm run rag:setup          # 建立 data store，輸出 config/rag-env.generated.txt
# 將片段併入 .env
npm run rag:ingest         # 從 data/training-materials 寫入 Vertex AI Search
npm run test:rag-search
```

- 切回 BQ：設 `SALES_KNOWLEDGE_BACKEND=bq`，無需改程式。

題庫查無時顯示的聯絡窗口（選填）：

```env
SALES_SCRIPT_CONTACT=總部話術管理窗口
```

除錯用（不連 GCP，一律回「題庫無」）：

```env
# USE_MOCK_CHAT=true
```

### 5.4 權限與首位管理員

```env
AUTH_SESSION_SECRET=請改為隨機長字串
APP_PUBLIC_URL=http://localhost:3000
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_DISPLAY_NAME=系統管理員
SEED_ADMIN_BRANCH=總部
SEED_ADMIN_PASSWORD=YourAdmin123
```

建立首位管理員：

```powershell
cd c:\Yulon\YNM_poc\web
npm run seed:admin
```

### 5.5 測試／正式環境切換（同 Project 不同 Dataset）

專案提供兩份環境檔：

- `.env.test` → `BIGQUERY_DATASET=YNM_Sales_AI_Coach_test`
- `.env.prod` → `BIGQUERY_DATASET=YNM_Sales_AI_Coach_prod`

切換方式：

```powershell
cd c:\Yulon\YNM_poc\web
npm run env:use:test
# 或
npm run env:use:prod
```

切換後請重啟 `npm run dev`，再執行：

```powershell
npm run bq:verify-env
```

### 5.6 Excel 路徑（後台流程功能，選填）

主庫與待比對檔預設在 **`web/data/`**（見 [`data/README.md`](../data/README.md)）：

| 檔案 | 預設檔名 |
|------|----------|
| 主庫 | `web/data/AI話術演練表.xlsx` |
| 待比對 | `web/data/Demo話術演練資料.xlsx` |

可覆寫：

```env
# EXCEL_MAIN_PATH=C:\path\to\AI話術演練表.xlsx
# EXCEL_INCOMING_PATH=C:\path\to\Demo話術演練資料.xlsx
```

若無 Excel，**銷售助手仍可在 BQ 有資料時運作**；但「匯入與檢查／釐清／法務」等頁面可能無法載入。

---

## 六、匯入話術至 BigQuery（銷售助手必備資料）

### 方式 A — 使用 API（建議）

在 `web` 目錄，將話術 Excel 路徑代入後執行（PowerShell）：

```powershell
$file = "C:\path\to\AI話術演練表.xlsx"
curl.exe -X POST "http://localhost:3000/api/ingest/script-drills" `
  -F "file=@$file"
```

開發伺服器需已啟動（見第七節）。成功時回傳 JSON 含 `inserted` 筆數。

僅預覽、不寫入：

```powershell
curl.exe -X POST "http://localhost:3000/api/ingest/script-drills/preview?maxRows=20" `
  -F "file=@$file"
```

詳見 [BQ_INGEST_POC.md](./BQ_INGEST_POC.md)。

### 方式 B — BigQuery Console 手動上傳

依 [`script-drills-contract.ts`](../src/lib/ingest/script-drills-contract.ts) 欄位契約上傳 CSV／載入表，避免 autodetect 吃掉欄位。

---

## 七、啟動開發伺服器

```powershell
cd c:\Yulon\YNM_poc\web
npm run dev
```

終端機出現 `Ready` 後，瀏覽器開啟：**http://localhost:3000**

其他指令：

| 指令 | 說明 |
|------|------|
| `npm run build` | 正式建置 |
| `npm run start` | 執行建置後產物（需先 `build`） |
| `npm run dev:turbo` | 使用 Turbopack 開發（若遇相容問題請改回 `dev`） |
| `npm run env:use:test` | 切到測試 dataset 設定 |
| `npm run env:use:prod` | 切到正式 dataset 設定 |
| `npm run bq:create-prod` | 建立 prod dataset 與四張表 |
| `npm run bq:migrate:test-to-prod` | 複製 test 四張表資料到 prod |
| `npm run bq:verify-env` | 顯示目前 dataset 與 test/prod 筆數對帳 |

---

## 八、驗證是否啟動成功

### 8.1 檢查 BigQuery 連線與題庫

```powershell
cd c:\Yulon\YNM_poc\web
node scripts/test-bq-main.mjs
```

預期：`OK source=`、`OK count=` 且筆數 ≥ 1。若失敗，請檢查 `.env`、IAM、表名與表內是否有資料。

### 8.2 檢查 HTTP 與銷售問答（需 dev server 運行中）

另開終端機：

```powershell
cd c:\Yulon\YNM_poc\web
npm run smoke:portal
```

預期：首頁、銷售／對練／後台登入頁皆 200；`/api/sales/chat` 有 `reply`；後台登入後 analytics API 正常。

### 8.3 手動操作檢查清單

- [ ] http://localhost:3000 三個入口可點
- [ ] 後台：用 `seed-admin` 建立的管理員登入成功
- [ ] 用戶管理：新增一位業代，取得登入連結與初始密碼
- [ ] 銷售助手：業代以帳密登入後提問，有話術回覆或「題庫無」
- [ ] 後台首頁（資料總覽）顯示 BQ 資料來源，非「未設定 BigQuery」
- [ ] 上線前執行 `npm run env:use:prod` + `npm run bq:verify-env`，確認服務指向 prod dataset

---

## 九、登入與路徑速查

| 功能 | URL |
|------|-----|
| 入口首頁 | http://localhost:3000/ |
| 銷售助手登入 | http://localhost:3000/sales/login |
| 銷售助手對話 | http://localhost:3000/sales |
| 對練助手 | http://localhost:3000/roleplay |
| 後台登入 | http://localhost:3000/admin/login |
| 後台主頁 | http://localhost:3000/admin/home |
| 匯入與檢查 | http://localhost:3000/admin/inbox |
| 問題釐清 | http://localhost:3000/admin/clarification |
| 法務檢查 | http://localhost:3000/admin/legal |

| 帳號類型 | 建立方式 |
|----------|----------|
| 後台管理員 | `npm run seed:admin` |
| 銷售助手業代 | 後台「用戶管理」新增 |

---

## 十、常見問題

### 1. 後台總覽顯示「未設定 BigQuery」

- 確認 `web/.env` 存在且含 `BIGQUERY_PROJECT_ID`
- 重啟 `npm run dev`（Next 啟動時才讀取 `.env`）

### 2. 銷售助手永遠「題庫無」

- 執行 `node scripts/test-bq-main.mjs` 確認 BQ 有列
- 確認 `BIGQUERY_DATASET`、`BIGQUERY_TABLE_SCRIPT_DRILLS` 與實際表一致
- 認證帳號是否對該 Dataset 有 `bigquery.dataViewer` 以上權限

### 3. `Could not load the default credentials`

- 執行 `gcloud auth application-default login`，或
- 設定正確的 `GOOGLE_APPLICATION_CREDENTIALS` 指向有效 JSON

### 4. 匯入 API 回傳 403 / Permission denied

- 服務帳號或使用者需 Dataset 層級 `bigquery.dataEditor`
- 專案需 `bigquery.jobUser`

### 5. `GEMINI_DATA_ANALYTICS_AGENT_ID 未設定`

- 屬正常：預設 `SALES_CHAT_MODE=bq-fast` 會自動改用 BQ 快答
- 若要用 Gemini，請補齊 Agent 相關環境變數並啟用 API

### 6. 後台釐清／法務頁錯誤「找不到 Excel」

- 在 `web/data/` 放置 `AI話術演練表.xlsx`，或設定 `EXCEL_MAIN_PATH`
- 或執行 `npm run build:demo-xlsx` 產生 `Demo話術演練資料.xlsx`（待比對用）

### 7. 埠號 3000 已被占用

```powershell
$env:PORT=3001; npm run dev
```

瀏覽器改開 http://localhost:3001 。

---

## 十一、正式環境（簡要）

本 PoC 以 `npm run dev` 為主。若要部署：

1. 建置：`npm run build`
2. 執行：`npm run start`（或部署至 Cloud Run / VM，由維運決定）
3. 在執行環境注入與本機相同的環境變數；**建議使用 Secret Manager 存放服務帳號 JSON**，勿寫入映像檔
4. 設定 HTTPS 與正式帳密（勿沿用 seed 密碼；由後台建立正式使用者）

---

## 十二、相關文件

| 文件 | 內容 |
|------|------|
| [README.md](../README.md) | 專案簡介與指令 |
| [BQ_INGEST_POC.md](./BQ_INGEST_POC.md) | Excel → BQ 匯入 API |
| [GEMINI_BQ_DATA_PATH.md](./GEMINI_BQ_DATA_PATH.md) | BQ × Gemini 技術路徑 |
| [PROJECT_SCOPE_SALES_TRAINING.md](./PROJECT_SCOPE_SALES_TRAINING.md) | 專案範疇 |
| [platform-feature-ownership.html](./platform-feature-ownership.html) | 功能與分工總表（瀏覽器開啟） |

---

**文件版本**：對應 `web` PoC；若 GCP 專案或表結構變更，請同步更新 `.env.example` 與本文件。
