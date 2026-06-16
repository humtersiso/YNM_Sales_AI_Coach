import { Hono } from "hono";
import { cors } from "hono/cors";
import { roleplayRoutes } from "./routes/roleplay";
import { salesRoutes } from "./routes/sales";

export const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "ynm-assistants-api" }));

app.get("/v1/openapi", async (c) => {
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const yaml = await readFile(join(webRoot, "docs/openapi.yaml"), "utf8").catch(() => null);
  if (!yaml) {
    return c.json({ error: "openapi.yaml not found" }, 404);
  }
  return c.text(yaml, 200, { "Content-Type": "application/yaml; charset=utf-8" });
});

app.route("/v1/sales", salesRoutes);
app.route("/v1/roleplay", roleplayRoutes);
