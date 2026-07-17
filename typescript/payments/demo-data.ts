import type { Buyer, ProductInput } from "../src/lib/types.js";

// Synthetic buyer data — safe to commit. Never use real documents or PII.
export const demoBuyer: Buyer = {
  name: "Ana Souza",
  email: "ana.souza@example.com",
  document: { type: "CPF", number: "19100000000" },
};

export const demoProducts: ProductInput[] = [{ name: "Pro Plan", price: 4900, quantity: 1 }];

/** Reads a resource id from the first CLI argument or an env var. */
export function resourceIdFromArgs(envVar: string): string {
  const id = process.argv[2] ?? process.env[envVar];
  if (!id) {
    throw new Error(`Pass a resource id as the first argument or set ${envVar}.`);
  }
  return id;
}
