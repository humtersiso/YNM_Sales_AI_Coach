# 本機與 Cloud Run 行為對齊（維運 SOP）

本文件**不變更**銷售助手回答架構（grounded / augment / Gemini 摘要流程），僅協助排查「本機正常、上雲後 RAG／回覆不一致」。

## 0. 雙線並行（Gold Standard vs Cloud Parity）

| 軌道 | 環境檔 | Gemini 路徑 | 用途 |
|------|--------|-------------|------|
| **黃金標準** | `web/.env`（含 `GEMINI_API_KEY`） | Developer API | 本機 `npm run dev`、`npm run test:rag-grounded:log` |
| **雲端對齊** | `.env.docker.vertex`（無 API Key） | **Vertex ADC** | Docker、Cloud Run、`test:rag-grounded:log:vertex` |

雲端對齊軌道必設：

```bash
GEMINI_USE_VERTEX_ONLY=true
# 勿設定 GEMINI_API_KEY
GEMINI_VERTEX_PROJECT=gen-lang-client-0927009312
GEMINI_VERTEX_LOCATION=global
GEMINI_MODEL=gemini-3.1-flash-lite
```

**產生 Docker / Vertex 用 env：**

```bash
cd web
npm run env:prepare:docker-vertex
gcloud auth application-default login
```

**驗證 Vertex 路徑（本機 CLI，不需 Docker）：**

```bash
npm run test:rag-grounded:log:vertex
# 產出 data/test-logs/grounded-vertex-*.log，與 02:45 黃金 log 比對
```

**Docker + ADC（與 Cloud Run 相同執行路徑）：**

```bash
npm run docker:run:local -- --build
npm run test:cloudrun:chat:sample http://localhost:8080
```

對齊成功 → `npm run deploy:test` 上 Cloud Run。

## 1. 身分憑證與 IAM（最常見）

| 環境 | 憑證來源 | 常見權限 |
|------|----------|----------|
| 本機 `npm run dev` | `gcloud auth application-default login` 個人帳號 | Owner / Editor，RAG、Vertex 幾乎全過 |
| Cloud Run | **執行服務帳號**（預設多為 `PROJECT_NUMBER-compute@developer.gserviceaccount.com`） | 若未授權 → `augmentPrompt` 403、retrieve 0 筆、Gemini 無 context |

**建議角色（服務帳號）：**

- `roles/aiplatform.user`（必要）
- `roles/logging.logWriter`（建議，方便查 log）

**檢查指令：**

```bash
cd web
npm run ops:check-iam
```

若出現 `Reauthentication failed`，請在**外部 PowerShell**（非 Cursor 內建終端）執行：

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project gen-lang-client-0927009312
```

Console：**Cloud Run → ynm-web-test → 安全性 → 服務帳戶**，確認非過期、且於 IAM 已綁定上述角色。

## 2. 本地跑容器（與雲端同 Dockerfile）

**Windows 若未安裝 Docker**（`'docker' 不是內部或外部命令`），改用：

```bash
cd web
npm run env:sync:cloud-test   # 補齊 GEMINI_VERTEX_* 等
npm run run:prod-local        # next build + start -p 8080
npm run test:cloudrun:chat:sample http://localhost:8080
```

有 Docker Desktop 時 — **預設 Vertex ADC 對齊模式**（使用 `.env.docker.vertex`，非 `.env`）：

```bash
cd web
npm run env:prepare:docker-vertex
npm run docker:run:local -- --build
```

驗證：

```bash
npm run test:cloudrun:chat:sample http://localhost:8080
```

若容器內與 `npm run dev` 結果不同，優先修 Dockerfile / env，而非改回答流程。

## 3. 環境變數

Cloud Run **讀不到**本機 `.env`。部署時以 `deploy/cloudrun-test.env.yaml` + `cloudrun-test.secrets.yaml` 合併後寫入服務。

**對照指令：**

```bash
cd web
npm run ops:verify-env
```

漏設 `RAG_CORPUS_*`、`RAG_PROJECT_ID`、`GEMINI_VERTEX_PROJECT` 等，常導致靜默 fallback、與本機 log 不一致。

更新 env 不重建映像：

```bash
npm run deploy:test:env
```

## 4. 即時 tail 雲端日誌

```bash
cd web
npm run ops:logs:tail
```

保持終端機開啟，於 UI 重現問題，搜尋：

- `[rag] augmentPrompt`
- `403` / `Forbidden` / `invalid_grant`
- `Gemini` / `Vertex model unavailable`

## 5. 建議排查順序

1. `npm run ops:check-iam`
2. `npm run ops:verify-env`
3. `npm run docker:run:local -- --build` → 對 `http://localhost:8080` 跑 `test:cloudrun:chat`
4. 部署後 `npm run ops:logs:tail` + 重現單題
5. 本機 grounded log：`npm run test:rag-grounded:log`（與前端顯示格式對齊）

## 相關腳本

| npm script | 說明 |
|------------|------|
| `ops:check-iam` | Cloud Run 服務帳號與 IAM |
| `ops:verify-env` | .env / yaml / 已部署 env 對照 |
| `docker:build:amd64` | 建置 amd64 映像 |
| `docker:run:local` | 本地容器 + .env + gcloud ADC |
| `ops:logs:tail` | 雲端即時 log |
| `test:cloudrun:chat` | 登入後逐題打 API（可傳 BASE_URL） |
