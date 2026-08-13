import { FccInfrastructureError, PolicyViolation } from "@covenant/sdk";
import { describe, expect, it } from "vitest";

import { explainOutcome } from "@/lib/outcome";

describe("action failures", () => {
  it("preserves an FCC refusal as evidence instead of an outage", () => {
    const hash = `0x${"1".repeat(64)}` as const;
    const outcome = explainOutcome(new PolicyViolation("recipient denied", "recipient denied", hash));
    expect(outcome).toMatchObject({ kind: "refused", instructionHash: hash });
    if (outcome.kind !== "refused") throw new Error("expected a policy refusal");
    expect(outcome.detail).toContain("No vault execution transaction was sent");
  });

  it("turns an FCC timeout into a recoverable instruction", () => {
    expect(explainOutcome(new Error("FCC authorization timed out"))).toEqual({
      kind: "error",
      detail: "FCC did not return a decision in time. Check deployment health before retrying; no vault execution was submitted.",
    });
  });

  it("preserves a confirmed instruction when the confidential engine fails", () => {
    const instructionId = `0x${"2".repeat(64)}` as const;
    const transaction = `0x${"3".repeat(64)}` as const;
    expect(explainOutcome(new FccInfrastructureError(
      "FCC extension failed: context deadline exceeded",
      instructionId,
      transaction,
    ))).toMatchObject({ kind: "error", instructionHash: transaction });
  });

  it("recognizes a policy refusal wrapped across a package boundary", () => {
    const instructionId = `0x${"4".repeat(64)}` as const;
    const transaction = `0x${"5".repeat(64)}` as const;
    const crossBundleRefusal = Object.assign(new Error("per-transaction limit exceeded"), {
      name: "PolicyViolation",
      reason: "per-transaction limit exceeded",
    });
    const outcome = explainOutcome(new FccInfrastructureError(
      crossBundleRefusal.message,
      instructionId,
      transaction,
      crossBundleRefusal,
    ));
    expect(outcome).toMatchObject({
      kind: "refused",
      rule: "Per-payment limit exceeded",
      instructionHash: transaction,
    });
  });

  it("does not expose wallet provider error noise", () => {
    expect(explainOutcome(new Error("User rejected request (4001)"))).toEqual({
      kind: "error",
      detail: "You rejected the request in your wallet. No action was executed.",
    });
  });
});
