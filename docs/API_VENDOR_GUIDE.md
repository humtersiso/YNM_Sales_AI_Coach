# 雙助手 API — 廠商對接指南

## 文件

- OpenAPI 3：`docs/openapi.yaml`
- 架構說明：`docs/ARCHITECTURE.md`

## Base URL

| 環境 | URL |
|------|-----|
| 本機 | `http://localhost:8080/v1` |
| 測試 | 部署後 `ynm-assistants-api` Cloud Run + API Gateway |

## 認證

所有端點需：

```
Authorization: Bearer <token>
```

### 開發聯調（api_key 模式）

環境變數 `YNM_API_AUTH_MODE=api_key`，並設定 `YNM_API_KEY`。

額外 Header 傳遞業代身分（模擬裕日 IAM claims）：

| Header | 說明 |
|--------|------|
| `X-YNM-User-Id` | 業代 ID |
| `X-YNM-Username` | 帳號 |
| `X-YNM-Display-Name` | 顯示名稱（可選） |
| `X-YNM-Branch` | 據點 |

### 正式（jwt 模式）

環境變數 `YNM_API_AUTH_MODE=jwt`，驗證 JWT 簽章（`YNM_JWT_SECRET` 或 JWKS URL）。

Claims 對應：`sub` → userId，`preferred_username` → username，`branch` → branch。

### 過渡期（舊 `/api/sales`、`/api/roleplay`）

PoC Next 路由已支援 **Bearer 優先、Cookie 並存**，便於廠商在切換 Gateway 前聯調。Production 請以 `ynm-assistants-api`（`/v1/*`）為準。

## 錯誤格式

```json
{ "error": "說明文字" }
```

| HTTP | 情境 |
|------|------|
| 400 | 參數錯誤 |
| 401 | 未授權 |
| 404 | 場次／情境不存在 |
| 500 | 伺服器錯誤 |

## 銷售串流範例

```bash
curl -N -X POST http://localhost:8080/v1/sales/chat/stream \
  -H "Authorization: Bearer $YNM_API_KEY" \
  -H "X-YNM-User-Id: agent001" \
  -H "X-YNM-Username: agent001" \
  -H "Content-Type: application/json" \
  -d '{"message":"RAV4 跟 X-TRAIL 油耗怎麼比？"}'
```

每行 NDJSON 事件，最終 `type: done` 含完整 `result`。

## 對練完整一場範例

```bash
# 1. 開局
curl -X POST http://localhost:8080/v1/roleplay/sessions \
  -H "Authorization: Bearer $YNM_API_KEY" \
  -H "X-YNM-User-Id: agent001" \
  -H "Content-Type: application/json" \
  -d '{"mode":"random","config":{"personaId":"p1","difficulty":"advanced"}}'

# 2. 業代發言（重複至輪次結束）
curl -X POST http://localhost:8080/v1/roleplay/sessions/{sessionId}/turn \
  -H "Authorization: Bearer $YNM_API_KEY" \
  -H "X-YNM-User-Id: agent001" \
  -H "Content-Type: application/json" \
  -d '{"message":"您好，想了解哪方面呢？"}'

# 3. 完賽評分
curl -X POST http://localhost:8080/v1/roleplay/sessions/{sessionId}/finish \
  -H "Authorization: Bearer $YNM_API_KEY" \
  -H "X-YNM-User-Id: agent001"
```

評分由伺服器計算五維與總分，前端請直接顯示 `dimensions` 與 `score`，勿自行加總規則。
