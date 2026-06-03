#!/usr/bin/env python3
"""
Phase 3（可選）：將 knowledge_units 的 text_chunk 批次轉為 qa_pair。
需設定 GEMINI_API_KEY 或 Vertex 憑證；未設定時僅列印說明。
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone

from google.cloud import bigquery


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def fetch_chunks(client: bigquery.Client, project: str, dataset: str, limit: int):
    sql = f"""
        SELECT unit_id, asset_id, ingest_batch_id, product_line, title, standard_script, source_locator, tags
        FROM `{project}.{dataset}.knowledge_units`
        WHERE unit_type = 'text_chunk'
          AND LENGTH(COALESCE(standard_script, '')) > 200
        ORDER BY ingested_at DESC
        LIMIT @lim
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("lim", "INT64", limit)]
    )
    return list(client.query(sql, job_config=job_config).result())


def extract_qa_with_gemini(text: str, title: str) -> list[dict]:
    api_key = env("GEMINI_API_KEY")
    if not api_key:
        return []

    import urllib.request

    model = env("GEMINI_MODEL", "gemini-3.1-flash-lite")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    prompt = (
        "你是汽車銷售訓練教材編輯。根據以下內容，產出 1～3 組 JSON 陣列，"
        '每組含 "customer_question" 與 "standard_script"（繁體中文、簡潔）。'
        f"\n標題：{title}\n內文：\n{text[:6000]}"
    )
    body = json.dumps(
        {"contents": [{"parts": [{"text": prompt}]}]},
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())

    raw = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start < 0 or end <= start:
        return []
    pairs = json.loads(raw[start:end])
    if not isinstance(pairs, list):
        return []
    out = []
    for p in pairs:
        if isinstance(p, dict) and p.get("customer_question") and p.get("standard_script"):
            out.append(
                {
                    "customer_question": str(p["customer_question"]).strip(),
                    "standard_script": str(p["standard_script"]).strip(),
                }
            )
    return out


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    project = env("BIGQUERY_PROJECT_ID", env("GOOGLE_CLOUD_PROJECT"))
    dataset = env("BIGQUERY_DATASET", "YNM_Sales_AI_Coach_test")
    if not project:
        raise SystemExit("請設定 BIGQUERY_PROJECT_ID")

    if not env("GEMINI_API_KEY"):
        print("未設定 GEMINI_API_KEY，跳過 Gemini Q&A 萃取。可手動執行或改用 Document AI。")
        return

    client = bigquery.Client(project=project)
    chunks = fetch_chunks(client, project, dataset, limit)
    now = datetime.now(timezone.utc).isoformat()
    rows = []

    for ch in chunks:
        pairs = extract_qa_with_gemini(ch["standard_script"] or "", ch["title"] or "")
        for p in pairs:
            rows.append(
                {
                    "unit_id": str(uuid.uuid4()),
                    "ingest_batch_id": ch["ingest_batch_id"],
                    "asset_id": ch["asset_id"],
                    "product_line": ch.get("product_line") or "_legacy",
                    "unit_type": "qa_pair",
                    "title": ch["title"],
                    "customer_question": p["customer_question"],
                    "standard_script": p["standard_script"],
                    "source_locator": ch["source_locator"],
                    "tags": list(ch["tags"] or []),
                    "language": "zh-TW",
                    "content_hash": uuid.uuid4().hex[:32],
                    "ingested_at": now,
                }
            )

    if rows:
        table = f"{project}.{dataset}.knowledge_units"
        errors = client.insert_rows_json(client.get_table(table), rows)
        if errors:
            raise RuntimeError(errors[:2])
    print(json.dumps({"chunks_processed": len(chunks), "qa_rows": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
