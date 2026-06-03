# 對練知識庫匯入（Phase 2）

## 目標

解析 `data/roleplay-knowledge/` 內：

- `scenarios/KB-T33-*.xlsx` → `roleplay_scenarios`（Section A～F）
- `global/*.xlsx` → Persona、五維評分權重、S～D 等級

## 實作待辦

1. `parse-roleplay-scenario-xlsx.ts`：對照 Sheet `A_情境設定` … `F_評分維度與標準`
2. `parse-roleplay-global-xlsx.ts`：三個工作表
3. `roleplay-ingest-cli.ts` + `npm run roleplay:ingest`
4. `scenario-repository.ts` 改為 `ROLEPLAY_STORE=bq` 時讀 BQ

## DDL

- [`sql/roleplay_scenarios.sql`](../../../sql/roleplay_scenarios.sql)
- [`sql/roleplay_sessions.sql`](../../../sql/roleplay_sessions.sql)
