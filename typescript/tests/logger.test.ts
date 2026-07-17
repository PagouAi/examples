import { describe, it, expect } from "vitest";
import { redact } from "../src/lib/logger.js";

describe("redact", () => {
  it("masks sensitive keys", () => {
    const out = redact({ Authorization: "Bearer abc", token: "pgct_123", amount: 4900 }) as Record<string, unknown>;
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.amount).toBe(4900);
  });

  it("masks card tokens and bearer strings inside free text", () => {
    expect(redact("charge with pgct_secret123")).toBe("charge with [REDACTED]");
    expect(redact("header Bearer sk_live_xyz here")).toBe("header [REDACTED] here");
  });

  it("redacts nested structures", () => {
    const out = redact({ buyer: { name: "Ana", document: { number: "19100000000" } } }) as Record<string, unknown>;
    const buyer = out.buyer as Record<string, unknown>;
    const document = buyer.document as Record<string, unknown>;
    expect(buyer.name).toBe("Ana");
    expect(document.number).toBe("[REDACTED]");
  });

  it("handles circular references", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = redact(obj) as Record<string, unknown>;
    expect(out.self).toBe("[Circular]");
  });
});
