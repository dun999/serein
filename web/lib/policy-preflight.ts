import { formatUsd, PolicyViolation } from "@covenant/sdk";

export function requireWithinPerPaymentLimit(amountUsd: bigint, perTxCapUsd?: string): void {
  if (!perTxCapUsd) return;
  const cap = BigInt(perTxCapUsd);
  if (amountUsd <= cap) return;

  const reason = `This request is ${formatUsd(amountUsd)}, above your per-payment limit of ${formatUsd(cap)}.`;
  throw new PolicyViolation(reason, reason);
}
