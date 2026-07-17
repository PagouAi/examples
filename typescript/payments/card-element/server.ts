import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PagouHttpClient } from "../../src/lib/http.js";
import { loadConfig } from "../../src/lib/config.js";
import { logger } from "../../src/lib/logger.js";
import type { CreateTransactionInput, Transaction } from "../../src/lib/types.js";
import { demoBuyer, demoProducts } from "../demo-data.js";

// Minimal server for the browser card flow. It serves the Payment Element page
// (injecting only the publishable key) and exposes POST /api/pay, which turns
// the browser's pgct_ token into a real charge via POST /v2/transactions.
// Run: npm run pay:card:server  then open http://localhost:3000
const config = loadConfig();
const client = new PagouHttpClient(config);
const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(join(here, "index.html"), "utf8");
      const publishableKey = config.publishableKey ?? "pk_test_set_PAGOU_PUBLISHABLE_KEY";
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html.replace("__PUBLISHABLE_KEY__", publishableKey));
      return;
    }

    if (req.method === "POST" && req.url === "/api/pay") {
      const { token } = JSON.parse(await readBody(req)) as { token?: string };
      if (!token || !/^pg(ct|pm)_/.test(token)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "A pgct_/pgpm_ token is required." }));
        return;
      }

      const input: CreateTransactionInput = {
        amount: 4900,
        method: "credit_card",
        currency: "BRL",
        token,
        installments: 1,
        buyer: demoBuyer,
        products: demoProducts,
        external_ref: `card_${Date.now()}`,
      };

      const { data: tx } = await client.requestData<Transaction>({
        method: "POST",
        path: "/v2/transactions",
        body: input,
      });

      // Return id/status/next_action so the browser SDK can continue 3DS.
      // Do NOT fulfill here — wait for the confirmed webhook.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: { id: tx.id, status: tx.status, next_action: tx.next_action ?? null },
        }),
      );
      return;
    }

    res.writeHead(404).end("Not found");
  } catch (error) {
    logger.error("Request failed", { message: error instanceof Error ? error.message : String(error) });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unexpected error" }));
  }
});

server.listen(PORT, () => logger.info(`Card demo on http://localhost:${PORT}`));
