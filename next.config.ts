import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** 專案實際在 `.../YNM_poc/web`，避免 Turbopack 誤用父目錄 `YNM_poc` 解析 tailwindcss 等依賴 */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: turbopackRoot,
  },
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
