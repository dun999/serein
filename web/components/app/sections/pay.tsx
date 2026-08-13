"use client";

import { formatUsd, parseFxrp, type FccAuthorization } from "@covenant/sdk";
import { FingerprintIcon, RadioTowerIcon } from "lucide-react";
import { useState } from "react";
import { getAddress } from "viem";

import { PayForm } from "@/components/app/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCovenant } from "@/lib/covenant-provider";
import { requireWithinPerPaymentLimit } from "@/lib/policy-preflight";
import { useTreasury } from "@/lib/treasury-provider";

export function PaySection() {
  const { vaultClient } = useCovenant();
  const { vault, snap, busy, run } = useTreasury();
  const [pending, setPending] = useState<{
    vault: `0x${string}`;
    to: `0x${string}`;
    amount: bigint;
    rawAmount: string;
    authorization: FccAuthorization;
  } | null>(null);

  const activePending = pending?.vault === vault ? pending : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Pay from the vault</CardTitle>
          <CardDescription>
            The first transaction asks FCC for a private policy decision. A second transaction
            executes only the exact authorization it returned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayForm
            busy={busy === "authorize-pay"}
            disabled={!vault || !snap || !vaultClient || snap.state.status === "locked" || activePending !== null}
            onSubmit={(to, rawAmount) =>
              run("authorize-pay", async () => {
                if (!vault || !snap || !vaultClient) throw new Error("Vault is not ready");
                const amount = parseFxrp(rawAmount);
                const recipient = getAddress(to);
                const quote = await vaultClient.quote(vault, amount);
                requireWithinPerPaymentLimit(quote.amountUsd, snap.policy?.perTxCapUsd);
                const threshold = snap.policy ? BigInt(snap.policy.stepUpThresholdUsd) : 0n;
                const needsPasskey = quote.amountUsd > threshold;
                if (needsPasskey && !snap.passkey) {
                  throw new Error("This payment requires the passkey, but its local credential metadata is unavailable");
                }
                const authorization = await vaultClient.authorizeSpend({
                  vault,
                  to: recipient,
                  amount,
                  passkey: needsPasskey ? (snap.passkey ?? undefined) : undefined,
                });
                setPending({ vault, to: recipient, amount, rawAmount, authorization });
                return {
                  kind: "ready",
                  message: `${rawAmount} FXRP was approved at ${formatUsd(authorization.amountUsd)}. Click Execute payment while this authorization is fresh.`,
                  instructionHash: authorization.instructionTransaction,
                  authorization,
                };
              })
            }
          />
          {activePending ? (
            <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <Button
                onClick={() =>
                  run("execute-pay", async () => {
                    if (!vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.executeSpend(activePending);
                    const authorization = activePending.authorization;
                    const rawAmount = activePending.rawAmount;
                    setPending(null);
                    return {
                      kind: "done",
                      message: `${rawAmount} FXRP was paid from the vault.`,
                      instructionHash: authorization.instructionTransaction,
                      authorization,
                      hash,
                    };
                  })
                }
                disabled={busy !== null}
              >
                {busy === "execute-pay" ? <Spinner data-icon="inline-start" /> : null}
                Execute payment
              </Button>
              <Button variant="outline" onClick={() => setPending(null)} disabled={busy !== null}>
                Discard authorization
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
          <CardDescription>Nothing here trusts values supplied by this page.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          <div className="flex items-start gap-3">
            <RadioTowerIcon className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-muted-foreground">
              FCC decrypts policy version {snap?.state.policyVersion.toString() ?? "—"}, reads the
              vault nonce and balance, then prices the request through FTSOv2. Your current
              per-payment limit is {snap?.policy ? formatUsd(BigInt(snap.policy.perTxCapUsd)) : "confidential"}.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <FingerprintIcon className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-muted-foreground">
              Above {snap?.policy ? formatUsd(BigInt(snap.policy.stepUpThresholdUsd)) : "the private threshold"},
              your device asks for biometric or PIN verification.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
