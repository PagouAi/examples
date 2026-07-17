import { Client } from "@pagouai/api-sdk";
import { loadConfig, type PagouConfig } from "./config.js";

/**
 * Builds the official `@pagouai/api-sdk` client from the shared environment
 * config. The SDK covers transactions, transfers and subscriptions; customers
 * and checkout-links are not SDK resources, so those flows use the raw client.
 */
export function createSdkClient(config: PagouConfig = loadConfig()): Client {
  return new Client({
    apiKey: config.apiToken,
    environment: config.environment,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}
