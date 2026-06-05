/**
 * 檢查 Cloud Run 執行服務帳號與 Vertex RAG 建議 IAM 角色
 * 用法：npm run ops:check-iam
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { projectId, region, service, recommendedIamRoles, optionalIamRoles } = require("./cloudrun-ops-config.cjs");
const { gcloudRun, printGcloudAuthHelp } = require("./gcloud-ops-util.cjs");

function gcloud(args) {
  return gcloudRun(args);
}

function defaultComputeSaEmail() {
  const r = gcloud(["projects", "describe", projectId, "--format=value(projectNumber)"]);
  const num = r.ok ? r.stdout : "";
  if (!num) return null;
  return `${num}-compute@developer.gserviceaccount.com`;
}

function main() {
  console.log("Cloud Run IAM 檢查");
  console.log(`  project: ${projectId}`);
  console.log(`  service: ${service} (${region})\n`);

  const desc = gcloud([
    "run",
    "services",
    "describe",
    service,
    "--region",
    region,
    "--project",
    projectId,
    "--format=value(spec.template.spec.serviceAccountName)",
  ]);
  if (!desc.ok) {
    console.error("無法讀取 Cloud Run 服務：");
    console.error(desc.stderr || desc.stdout);
    if (desc.authError) printGcloudAuthHelp();
    else console.error("\n請確認 gcloud 已安裝且具 Cloud Run 讀取權限。");
    process.exit(1);
  }

  const configured = desc.stdout;
  const email = configured && configured.includes("@") ? configured : defaultComputeSaEmail();

  if (!email) {
    console.log("無法解析執行服務帳號 email。");
    process.exit(1);
  }

  console.log(
    configured && configured.includes("@")
      ? `執行服務帳號: ${email}`
      : `執行服務帳號: ${email}（Cloud Run 未自訂，使用 Compute Engine 預設）`,
  );
  console.log("");

  const policy = gcloud([
    "projects",
    "get-iam-policy",
    projectId,
    "--flatten=bindings[].members",
    `--filter=bindings.members:serviceAccount:${email}`,
    "--format=value(bindings.role)",
  ]);

  const roles = policy.ok
    ? policy.stdout.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
    : [];

  const hasVertexAccess =
    roles.includes("roles/aiplatform.user") ||
    roles.includes("roles/aiplatform.admin") ||
    roles.includes("roles/editor") ||
    roles.includes("roles/owner");

  console.log("專案 IAM 綁定角色：");
  if (roles.length === 0) {
    console.log("  （未找到 → 常見症狀：augmentPrompt 403、retrieve 0 筆、與本機 ADC 結果不一致）\n");
  } else {
    for (const r of roles.sort()) console.log(`  • ${r}`);
    console.log("");
  }

  let fail = false;
  if (!hasVertexAccess) {
    console.log("缺少 Vertex AI 權限（需 roles/aiplatform.user 或 roles/editor 以上）");
    fail = true;
  } else if (!roles.includes("roles/aiplatform.user")) {
    console.log("（提示）已有 roles/editor，Vertex 通常可用；正式環境建議改為最小權限 roles/aiplatform.user");
  }
  if (!roles.includes("roles/logging.logWriter")) {
    console.log("（選用）未綁定 roles/logging.logWriter（僅影響結構化 log 寫入）");
  }
  for (const opt of optionalIamRoles) {
    if (!roles.includes(opt)) {
      console.log(`（選用）未綁定: ${opt}`);
    }
  }

  if (fail) {
    console.log("\n授予範例：");
    console.log(
      `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${email}" --role="roles/aiplatform.user"`,
    );
    process.exit(1);
  }

  console.log("必要角色檢查通過。");
  console.log("下一步：npm run ops:verify-env → npm run docker:run:local → npm run ops:logs:tail");
}

main();
