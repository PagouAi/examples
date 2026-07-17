import { createServer } from "node:http";
import { logger } from "../src/lib/logger.js";
import { parseWebhook } from "./handlers.js";
import { markProcessed } from "./store.js";
import { processEvent } from "./processor.js";

// Webhook receiver for the three event families. It follows the rules every
// handler must: parse the envelope, require the event id, dedupe redeliveries,
// answer 2xx immediately, and offload the slow reconciliation. Business state
// is updated only inside the offloaded processor, only on confirmed events.
// Run: npm run webhooks:server   (POST envelopes to http://localhost:4000/webhooks/pagou)
const PORT = Number(process.env.PORT ?? 4000);

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function reply(res: import("node:http").ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/pagou") {
    reply(res, 404, { error: "not_found" });
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(await readBody(req));
  } catch {
    reply(res, 400, { error: "invalid_json" });
    return;
  }

  const event = parseWebhook(parsedBody);
  if ("error" in event) {
    // Documented ingestion error for a missing event id.
    reply(res, event.error === "missing_event_id" ? 400 : 422, { error: event.error });
    return;
  }

  // Dedupe synchronously: a redelivery is acknowledged without reprocessing.
  const isFirstDelivery = markProcessed(event.id);
  if (!isFirstDelivery) {
    logger.info(`Duplicate delivery ignored: ${event.id} (${event.eventType})`);
    reply(res, 200, { received: true });
    return;
  }

  // Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
  // reconciliation so a slow API call never delays the response or risks a retry.
  reply(res, 200, { received: true });
  setImmediate(() => {
    processEvent(event).catch((error) => {
      logger.error(`Deferred processing failed for ${event.id}`, {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
});

server.listen(PORT, () => logger.info(`Webhook receiver on http://localhost:${PORT}/webhooks/pagou`));
