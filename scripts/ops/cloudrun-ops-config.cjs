/** Cloud Run 維運腳本共用設定（與 deploy-cloudrun-test.cjs 對齊） */
const path = require("node:path");

const webRoot = path.join(__dirname, "..", "..");

module.exports = {
  webRoot,
  projectId: process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312",
  region: process.env.DEPLOY_REGION || "asia-east1",
  service: process.env.DEPLOY_SERVICE || "ynm-web-test",
  envYaml: path.join(webRoot, "deploy/cloudrun-test.env.yaml"),
  secretsYaml: path.join(webRoot, "deploy/cloudrun-test.secrets.yaml"),
  dotEnv: path.join(webRoot, ".env"),
  dotEnvDockerVertex: path.join(webRoot, ".env.docker.vertex"),
  localImage: process.env.LOCAL_DOCKER_IMAGE || "ynm-web-local:test",
  /** 建議 Cloud Run 執行服務帳號具備的角色（RAG + Gemini on Vertex） */
  recommendedIamRoles: [
    "roles/aiplatform.user",
    "roles/logging.logWriter",
  ],
  optionalIamRoles: ["roles/storage.objectViewer", "roles/discoveryengine.viewer"],
};
