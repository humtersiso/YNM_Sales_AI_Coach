import type { SalesChatRequestBody } from "@ynm/contracts";
import { salesChat, salesChatStreamEvents, salesKnowledgeMeta } from "@ynm/sales-core";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";

function ndjson(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

export const salesRoutes = new Hono<{ Variables: AuthVariables }>();

salesRoutes.use("*", requireAuth);

salesRoutes.post("/chat", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as SalesChatRequestBody;
  const result = await salesChat(user, body);
  if ("error" in result && result.status !== 200) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.body);
});

salesRoutes.post("/chat/stream", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as SalesChatRequestBody;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of salesChatStreamEvents(user, body)) {
        controller.enqueue(encoder.encode(ndjson(event)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});

salesRoutes.get("/knowledge-meta", async (c) => {
  return c.json(await salesKnowledgeMeta());
});
