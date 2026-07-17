/** Formats an integer amount in the smallest currency unit as a display string. */
export function formatAmount(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

/** A short, unique idempotency key for a given operation and reference. */
export function idempotencyKey(operation: string, reference: string): string {
  return `${operation}_${reference}`;
}

/** Prints a labelled JSON block for readable script output. */
export function printResult(label: string, value: unknown): void {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(value, null, 2));
}
