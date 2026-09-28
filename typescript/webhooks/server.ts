import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { logger } from "../src/lib/logger.js";
import { parseWebhook } from "./handlers.js";
import { markProcessed } from "./store.js";
import { processEvent } from "./processor.js";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from "./verify.js";

// Webhook receiver for the three event families. When PAGOU_SECURITY_TOKEN is
// set it verifies X-Pagou-Signature on the raw body before JSON.parse, then
// requires the event id, dedupes redeliveries, answers 2xx immediately, and
// offloads reconciliation. Business state changes only inside that processor,
// and only on confirmed events.
// Run: npm run webhooks:server   (POST envelopes to http://localhost:4000/webhooks/pagou)
const PORT = Number(process.env.PORT ?? 4000);

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createWebhookServer(): Server {
  return createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/webhooks/pagou") {
      reply(res, 404, { error: "not_found" });
      return;
    }

    const rawBody = await readBody(req);
    const verification = verifyWebhookSignature({
      securityToken: process.env.PAGOU_SECURITY_TOKEN,
      rawBody,
      timestamp: headerValue(req, TIMESTAMP_HEADER),
      signature: headerValue(req, SIGNATURE_HEADER),
    });
    if (!verification.ok) {
      logger.warn(`Rejected webhook POST: ${verification.error}`);
      reply(res, 401, { error: verification.error });
      return;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      reply(res, 400, { error: "invalid_json" });
      return;
    }

    const event = parseWebhook(parsedBody);
    if ("error" in event) {
      reply(res, event.error === "missing_event_id" ? 400 : 422, { error: event.error });
      return;
    }

    const isFirstDelivery = markProcessed(event.id);
    if (!isFirstDelivery) {
      logger.info(`Duplicate delivery ignored: ${event.id} (${event.eventType})`);
      reply(res, 200, { received: true });
      return;
    }

    reply(res, 200, { received: true });
    setImmediate(() => {
      processEvent(event).catch((error) => {
        logger.error(`Deferred processing failed for ${event.id}`, {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    });
  });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  const server = createWebhookServer();
  server.listen(PORT, () => logger.info(`Webhook receiver on http://localhost:${PORT}/webhooks/pagou`));
}
