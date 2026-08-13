"use client";

import { formatUsd, parseFxrp } from "@covenant/sdk";
import { FingerprintIcon, RadioTowerIcon } from "lucide-react";
import { getAddress } from "viem";

import { PayForm } from "@/components/app/forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCovenant } from "@/lib/covenant-provider";
import { useTreasury } from "@/lib/treasury-provider";

export function PaySection() {
  const { vaultClient } = useCovenant();
  const { vault, snap, busy, run } = useTreasury();

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
            busy={busy === "pay"}
            disabled={!vault || !snap || !vaultClient || snap.state.status === "locked"}
            onSubmit={(to, rawAmount) =>
              run("pay", async () => {
                if (!vault || !snap || !vaultClient) throw new Error("Vault is not ready");
                const amount = parseFxrp(rawAmount);
                const quote = await vaultClient.quote(vault, amount);
                const threshold = snap.policy ? BigInt(snap.policy.stepUpThresholdUsd) : 0n;
                const needsPasskey = quote.amountUsd > threshold;
                if (needsPasskey && !snap.passkey) {
                  throw new Error("This payment requires the passkey, but its local credential metadata is unavailable");
                }
                const result = await vaultClient.spend({
                  vault,
                  to: getAddress(to),
                  amount,
                  passkey: needsPasskey ? (snap.passkey ?? undefined) : undefined,
                });
                return {
                  kind: "done",
                  message: `${rawAmount} FXRP was authorized at ${formatUsd(result.authorization.amountUsd)} and paid.`,
                  instructionHash: result.authorization.instructionTransaction,
                  hash: result.transaction,
                  authorization: result.authorization,
                };
              })
            }
          />
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
              vault nonce and balance, then prices the request through FTSOv2.
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
