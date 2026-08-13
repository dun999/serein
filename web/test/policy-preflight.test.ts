import { PolicyViolation } from "@covenant/sdk";
import { describe, expect, it } from "vitest";

import { requireWithinPerPaymentLimit } from "@/lib/policy-preflight";

describe("private policy preflight", () => {
  it("allows a request at the per-payment limit", () => {
    expect(() => requireWithinPerPaymentLimit(100_000_000n, "100000000")).not.toThrow();
  });

  it("refuses an over-limit request before dispatching an FCC instruction", () => {
    expect(() => requireWithinPerPaymentLimit(100_551_000n, "100000000"))
      .toThrow(PolicyViolation);
  });
});
