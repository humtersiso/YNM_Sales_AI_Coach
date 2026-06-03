# Legacy 後台頁面封存

本版管理後台 UI 僅保留「主頁儀表板」與「用戶管理」。以下為舊版完整實作備份（不參與 build）：

| 檔案 | 原路由 |
|------|--------|
| `main-data-page.tsx` | `/admin` 資料總覽 |
| `inbox-page.tsx` | `/admin/inbox` 匯入與檢查 |
| `clarification-page.tsx` | `/admin/clarification` 問題流程 |
| `experts-page.tsx` | `/admin/experts` 專家名單 |

現行路由已 redirect 至 `/admin/home`。
