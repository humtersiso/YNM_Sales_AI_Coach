# 寄信整合與「回信即回寫」可行性（POC → 上線）

## 現況

- 步驟 4「一鍵發信」呼叫 `POST /api/notify/mock`：會先依環境決定是否經 **SendGrid** 寄出，並將摘要寫入記憶體內的通知紀錄。
- **Mock**：未設定 `SENDGRID_API_KEY` 或 `NOTIFY_FROM_EMAIL` 時，不會對外寄信，回應中的 `deliveryMode` 為 `mock`。
- 新版頁面架構下，專家回覆可由「問題待釐清清單」與信內 token 連結兩條路徑同步進平台；法務同理。

## 環境變數（真實寄送 POC）

| 變數 | 說明 |
|------|------|
| `SENDGRID_API_KEY` | SendGrid API Key（Bearer） |
| `NOTIFY_FROM_EMAIL` | 已驗證之寄件人信箱 |

設定後，`deliveryMode` 會為 `sendgrid`；失敗時訊息會寫在通知摘要中，便於除錯。

其他供應商（SMTP、AWS SES、Microsoft Graph）可沿用同一抽象：在 `src/lib/notify-delivery.ts` 增加分支即可。

## 產品路線：連結回寫 vs Inbound 回信

| 作法 | 說明 | POC 建議 |
|------|------|----------|
| **A. 信內一鍵連結** | 信中附帶含 `questionId` / `token` 的 HTTPS 連結，開啟後 PATCH／表單提交回寫 | **優先**：與現有法務 token 頁同一類機制，實作快、可追溯 |
| **B. Inbound Email Webhook** | 供應商（SendGrid Inbound、Mailgun Routes、SES Inbound）收信後 POST 到你的 API | 上線前須設定 MX、解析 multipart、**驗證寄件者**與防偽造 |
| **C. Graph／Gmail 訂閱** | 訂閱企業信箱新信事件再拉內容 | 權限與合規成本高，適合已深度綁定 M365／Google 的組織 |

**結論**：POC 與內測建議採 **A**；正式「純回信」再評估 **B 或 C**。無論哪一種，建議在主旨或 `Reply-To` 帶 **唯一 thread id**（對應 `questionId`／`reviewId`），以利稽核與除錯。

## Inbound（B）上線前檢核重點

1. **網域與路由**：Inbound 子網域 MX 指向供應商；開發／staging 分開。
2. **寄件者驗證**：只接受預期網域或已登記專家信箱；拒絕任意 From。
3. **內容安全**：僅解析純文字或受控 HTML；附件預設忽略或病毒掃描。
4. **幂等**：同一 Message-Id 不重複入庫。
5. **稽核**：記錄 raw payload hash、處理結果、對應題目 id。

## 與本專案其他功能的銜接

- **法務審查**：`POST /api/legal-review/create` 產生的連結與專家通知連結屬同一類「token + 期限」模式，可共用資安假設（HTTPS、不公開轉發、日後可加 IP／簽名）。
- **主庫寫回**：專家／法務若僅透過 API 更新狀態，仍須由既有「儲存變更到主庫」流程或獨立同步 job 將結果寫入 `AI話術演練表.xlsx`（視產品是否仍以 Excel 為唯一真相來源）。
- **建議路線**：POC 先做「信內一鍵連結回寫（免登入）」；純回信 Inbound 方案保留為第二階段。
