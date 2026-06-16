# 已歸檔／非 Production API 範圍

以下模組仍保留於 repo 供 PoC 參考或遷移期相容，**不納入 ynm-assistants-api 部署**，由廠商或其他團隊負責。

## 前端（Next.js `app/`）

| 路徑 | 狀態 | 說明 |
|------|------|------|
| `app/page.tsx`、`app/login/` | 歸檔 | 廠商自有入口 |
| `app/sales/` | 歸檔 | 廠商銷售 UI |
| `app/roleplay/` | 歸檔 | 廠商對練 UI |
| `app/admin/` | 歸檔 | 廠商後台 |

內部 demo 可 `npm run dev` 啟動，**勿**作為對外 Production 主線。

## API（`app/api/` 中非雙助手部分）

| 前綴 | 狀態 |
|------|------|
| `app/api/admin/*` | 歸檔 |
| `app/api/workflow/*` | 歸檔 |
| `app/api/clarification/*` | 歸檔 |
| `app/api/legal*` | 歸檔 |
| `app/api/ingest/*` | 改 Job（`jobs/training-ingest`） |
| `app/api/sales/auth/*` | 歸檔（改 Bearer） |
| `app/api/portal/auth/*` | 歸檔 |

## 程式庫

| 路徑 | 狀態 |
|------|------|
| `legacy-admin/` | 封存 |
| `src/lib/excel-store/` | 封存 |
| `src/lib/incoming-queue.ts` | 封存 |
| `src/components/` | 歸檔（UI 參考） |

## Production 清單

僅部署：

- `apps/api-server`
- `packages/*`
- `src/lib/*`（被 core packages 引用）
- `docs/openapi.yaml`
- `deploy/cloudrun-api.env.yaml`
