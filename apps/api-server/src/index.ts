import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port }, () => {
  console.log(`ynm-assistants-api listening on http://0.0.0.0:${port}`);
});
