import { FccInfrastructureError, PolicyViolation } from "@covenant/sdk";

import type { Outcome } from "@/lib/treasury-provider";

export function explainOutcome(error: unknown): Outcome {
  if (error instanceof PolicyViolation) {
    return {
      kind: "refused",
      rule: "Private policy refused",
      detail: `${error.reason} No vault execution transaction was sent.`,
      instructionHash: error.instructionTransaction,
    };
  }

  if (error instanceof FccInfrastructureError) {
    return {
      kind: "error",
      detail: "FCC accepted the instruction, but the confidential engine failed before returning a decision. No vault execution was submitted; it is safe to retry after deployment health is restored.",
      instructionHash: error.instructionTransaction,
    };
  }

  const message = error instanceof Error
    ? ((error as { shortMessage?: string }).shortMessage ?? error.message)
    : "Something went wrong.";

  if (/user rejected|user denied|request rejected|4001/i.test(message)) {
    return { kind: "error", detail: "You rejected the request in your wallet. No action was executed." };
  }
  if (/wrong network|chain mismatch|unsupported chain|switch.*network/i.test(message)) {
    return { kind: "error", detail: "Switch your wallet to Flare Coston2, then try again." };
  }
  if (/FCC authorization timed out|FCC proxy.*unreachable|fetch failed|networkerror/i.test(message)) {
    return {
      kind: "error",
      detail: "FCC did not return a decision in time. Check deployment health before retrying; no vault execution was submitted.",
    };
  }
  if (/nonce|expired|deadline|policy version|stale authorization/i.test(message)) {
    return {
      kind: "error",
      detail: "Vault state changed while this action was pending. Refresh the vault and request a new FCC authorization.",
    };
  }
  if (/This passkey belongs to|This policy allows/i.test(message)) {
    return {
      kind: "error",
      detail: message,
    };
  }
  if (/passkey.*unavailable|credential metadata|NotAllowedError|SecurityError/i.test(message)) {
    return {
      kind: "error",
      detail: "Google Password Manager could not provide the enrolled passkey. Confirm that passkey sync is enabled, use the same Google account, and open the exact hostname where the vault passkey was enrolled. localhost, 127.0.0.1, and the live domain are different passkey identities.",
    };
  }
  if (/xaman/i.test(message)) {
    return {
      kind: "error",
      detail: "Xaman could not complete the signing handoff. The XRP payment was not submitted; retry after checking deployment health.",
    };
  }

  return { kind: "error", detail: message };
}
