const fs = require("node:fs");
const path = require("node:path");

const mode = (process.argv[2] || "").trim();
if (!mode || !["test", "prod"].includes(mode)) {
  console.error("Usage: node scripts/use-env.cjs <test|prod>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const src = path.join(root, `.env.${mode}`);
const dst = path.join(root, ".env");

if (!fs.existsSync(src)) {
  console.error(`Missing ${src}`);
  process.exit(1);
}

fs.copyFileSync(src, dst);
console.log(`Active env switched to: ${mode}`);
console.log(`Copied: ${src} -> ${dst}`);
