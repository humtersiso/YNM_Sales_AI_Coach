import assert from "node:assert/strict";
import {
  buildChunkSearchFields,
  extractScriptExcerpt,
  isFileLocatorOnlyCustomerQuestion,
  rebuildChunkCustomerQuestion,
} from "../src/lib/ingest/chunk-search-text";

const script = `
All rights reserved by Yulon Nissan
X-TRAIL ICE 1.5T VC-TURBO
最大馬力 204ps
最大扭力 30.6kgm
`;

assert.ok(isFileLocatorOnlyCustomerQuestion("RAV4 X-TRAIL VS RAV4改款_20260327.pdf (page 2)"));
assert.ok(!isFileLocatorOnlyCustomerQuestion("RAV4 (page 2) · 最大馬力 204ps"));

const excerpt = extractScriptExcerpt(script);
assert.match(excerpt, /204\s*ps/i);

const fields = buildChunkSearchFields("RAV4 X-TRAIL VS RAV4改款_20260327.pdf", "page", 2, script);
assert.equal(fields.title, "RAV4 X-TRAIL VS RAV4改款_20260327.pdf (page 2)");
assert.match(fields.customer_question, /204\s*ps/i);

const rebuilt = rebuildChunkCustomerQuestion({
  customer_question: "X-TRAIL 媒體報導彙整_202602.pptx (slide 3)",
  standard_script: script,
});
assert.ok(rebuilt);
assert.match(rebuilt!.customer_question, /204/i);

console.log("test-chunk-search-text: ok");
