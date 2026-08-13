import { FccInfrastructureError, PolicyViolation } from "@covenant/sdk";

import type { Outcome } from "@/lib/treasury-provider";

export function explainOutcome(error: unknown): Outcome {
  const refusal = policyRefusal(error);
  if (refusal) {
    return {
      kind: "refused",
      rule: policyRule(refusal.reason),
      detail: `${refusal.reason} No vault execution transaction was sent.`,
      instructionHash: refusal.instructionTransaction,
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
  // viem keeps the decoded custom error out of shortMessage, so a bare revert
  // reads as "The contract function ... reverted." Search the full error too.
  const revert = error instanceof Error ? `${message} ${error.message}` : message;

  if (/NothingPending/.test(revert)) {
    return {
      kind: "error",
      detail: "Nothing is scheduled yet. Start the delay first, then return here once it has elapsed.",
    };
  }
  if (/TimelockNotElapsed/.test(revert)) {
    return {
      kind: "error",
      detail: "The timelock has not elapsed yet. This action becomes available once the countdown reaches zero.",
    };
  }
  if (/VaultActive\(\)/.test(revert)) {
    return { kind: "error", detail: "This action needs the vault to be locked first." };
  }
  if (/VaultLocked\(\)/.test(revert)) {
    return { kind: "error", detail: "The vault is locked. Unlock it before moving funds." };
  }
  if (/IncompleteRedemption/.test(revert)) {
    return {
      kind: "error",
      detail: "FAssets could not redeem the whole balance in one step. Redemption settles in whole lots, so a remainder below one lot cannot be redeemed to XRP; withdraw it to your wallet instead.",
    };
  }

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

function policyRefusal(error: unknown): {
  reason: string;
  instructionTransaction?: `0x${string}`;
} | null {
  if (error instanceof PolicyViolation) {
    return { reason: error.reason, instructionTransaction: error.instructionTransaction };
  }
  if (!error || typeof error !== "object") return null;

  const candidate = error as {
    name?: unknown;
    reason?: unknown;
    instructionTransaction?: unknown;
    cause?: unknown;
  };
  const instructionTransaction = typeof candidate.instructionTransaction === "string"
    && /^0x[0-9a-fA-F]{64}$/.test(candidate.instructionTransaction)
    ? candidate.instructionTransaction as `0x${string}`
    : undefined;

  if (candidate.name === "PolicyViolation" && typeof candidate.reason === "string") {
    return { reason: candidate.reason, instructionTransaction };
  }

  if (candidate.cause && candidate.cause !== error) {
    const nested = policyRefusal(candidate.cause);
    if (nested) {
      return {
        reason: nested.reason,
        instructionTransaction: instructionTransaction ?? nested.instructionTransaction,
      };
    }
  }
  return null;
}

function policyRule(reason: string): string {
  if (/per-transaction limit/i.test(reason)) return "Per-payment limit exceeded";
  if (/daily limit/i.test(reason)) return "Daily limit exceeded";
  if (/recipient is not allowed/i.test(reason)) return "Recipient not approved";
  if (/passkey|webauthn/i.test(reason)) return "Passkey verification refused";
  return "Private policy refused";
}
