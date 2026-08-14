"use client";

import { formatFxrp, formatUsd, parseFxrp, type FccAuthorization } from "@covenant/sdk";
import { FingerprintIcon, KeyRoundIcon, LockKeyholeIcon, RadioTowerIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { AmountForm } from "@/components/app/forms";
import { Stat } from "@/components/app/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { FCC_TEE_ADDRESS, VAULT_FACTORY_ADDRESS, explorerAddress, shorten } from "@/lib/chain";
import { useCovenant } from "@/lib/covenant-provider";
import { requireWithinPerPaymentLimit } from "@/lib/policy-preflight";
import { useTreasury } from "@/lib/treasury-provider";

export function OverviewSection() {
  const { vault, vaults, snap, adopt, busy, run } = useTreasury();
  const { vaultClient, xrpUsd } = useCovenant();
  const policy = snap?.policy;
  const locked = snap?.state.status === "locked";
  const [preparedWithdraw, setPreparedWithdraw] = useState<{
    vault: `0x${string}`;
    amount: bigint;
    rawAmount: string;
    authorization: FccAuthorization;
  } | null>(null);
  const pendingWithdraw = preparedWithdraw?.vault === vault ? preparedWithdraw : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>{policy?.name ?? "Private vault"}</CardTitle>
              <CardDescription>
                An isolated FXRP account governed by an encrypted FCC policy.
              </CardDescription>
            </div>
            <Badge variant={snap?.state.status === "locked" ? "outline" : "secondary"}>
              {snap?.state.status === "locked" ? "Locked" : "Active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Protected balance"
              value={snap ? `${formatFxrp(snap.state.balance)} FXRP` : "—"}
              hint="direct-mint compatible"
            />
            <Stat
              label="Per payment"
              value={policy ? formatUsd(BigInt(policy.perTxCapUsd)) : "Confidential"}
              hint="evaluated inside FCC"
            />
            <Stat
              label="Passkey above"
              value={policy ? formatUsd(BigInt(policy.stepUpThresholdUsd)) : "Confidential"}
              hint="user verification required"
            />
            <Stat
              label="XRP/USD"
              value={xrpUsd ? `$${xrpUsd.priceUsd.toFixed(4)}` : "—"}
              hint="live · Flare FTSOv2"
            />
          </div>

          <Separator />

          <div className="grid gap-5 text-sm md:grid-cols-2">
            <Signal icon={LockKeyholeIcon} title="Encrypted policy">
              Recipients, labels, limits, and the passkey credential are encrypted. The chain
              stores commitment {snap ? shorten(snap.state.policyCommitment, 10, 8) : "—"}.
            </Signal>
            <Signal icon={RadioTowerIcon} title="Official FCC routing">
              Requests travel from the on-chain instruction sender through the extension proxy
              to registered confidential compute.
            </Signal>
            <Signal icon={FingerprintIcon} title="Phishing-resistant step-up">
              Large actions use WebAuthn user verification bound to the exact vault, operation,
              amount, nonce, and policy version.
            </Signal>
            <Signal icon={KeyRoundIcon} title="Two independent authorities">
              The wallet submits the action. FCC independently reads Flare state and must issue
              a one-use authorization before execution.
            </Signal>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdraw FXRP to your wallet</CardTitle>
          <CardDescription>
            Returns FXRP from the vault to the owner wallet without closing the vault. The
            destination is always the owner address, so the private recipient list does not apply,
            but the per-payment and daily limits still do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AmountForm
            id="withdrawAmount"
            label="Amount to withdraw"
            action="Authorize withdrawal"
            busy={busy === "authorize-withdraw"}
            disabled={!vault || !snap || !vaultClient || locked || pendingWithdraw !== null}
            hint={`FXRP · available ${snap ? formatFxrp(snap.state.balance) : "—"} · arrives at ${vault ? shorten(snap?.state.owner ?? vault) : "—"}`}
            onSubmit={(raw) =>
              run("authorize-withdraw", async () => {
                if (!vault || !snap || !vaultClient) throw new Error("Vault is not ready");
                const amount = parseFxrp(raw);
                if (amount > snap.state.balance) {
                  throw new Error(`The vault holds ${formatFxrp(snap.state.balance)} FXRP`);
                }
                const quote = await vaultClient.quote(vault, amount);
                requireWithinPerPaymentLimit(quote.amountUsd, snap.policy?.perTxCapUsd);
                const threshold = snap.policy ? BigInt(snap.policy.stepUpThresholdUsd) : 0n;
                const needsPasskey = quote.amountUsd > threshold;
                if (needsPasskey && !snap.passkey) {
                  throw new Error("This withdrawal requires the passkey, but its local credential metadata is unavailable");
                }
                const authorization = await vaultClient.authorizeWithdraw({
                  vault,
                  amount,
                  passkey: needsPasskey ? (snap.passkey ?? undefined) : undefined,
                });
                setPreparedWithdraw({ vault, amount, rawAmount: raw, authorization });
                return {
                  kind: "ready",
                  message: `${raw} FXRP was approved at ${formatUsd(authorization.amountUsd)}. Click Execute withdrawal while this authorization is fresh.`,
                  instructionHash: authorization.instructionTransaction,
                  authorization,
                };
              })
            }
          />
          {pendingWithdraw ? (
            <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <Button
                onClick={() =>
                  run("execute-withdraw", async () => {
                    if (!vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.executeWithdraw(pendingWithdraw);
                    const authorization = pendingWithdraw.authorization;
                    const rawAmount = pendingWithdraw.rawAmount;
                    setPreparedWithdraw(null);
                    return {
                      kind: "done",
                      message: `${rawAmount} FXRP was returned to your wallet.`,
                      instructionHash: authorization.instructionTransaction,
                      authorization,
                      hash,
                    };
                  })
                }
                disabled={busy !== null}
              >
                {busy === "execute-withdraw" ? <Spinner data-icon="inline-start" /> : <WalletIcon data-icon="inline-start" />}
                Execute withdrawal
              </Button>
              <Button variant="outline" onClick={() => setPreparedWithdraw(null)} disabled={busy !== null}>
                Discard authorization
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {vaults.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your isolated vaults</CardTitle>
            <CardDescription>
              Each address has its own balance, encrypted policy, nonce, and recovery path.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {vaults.map((address, index) => (
              <Button
                key={address}
                size="sm"
                variant={address === vault ? "secondary" : "outline"}
                onClick={() => void adopt(address)}
              >
                Vault {index + 1} · {shorten(address)}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <a className="underline underline-offset-2" href={explorerAddress(vault ?? VAULT_FACTORY_ADDRESS)} target="_blank" rel="noreferrer">
          Vault {vault ? shorten(vault) : "—"}
        </a>
        <a className="underline underline-offset-2" href={explorerAddress(FCC_TEE_ADDRESS)} target="_blank" rel="noreferrer">
          FCC machine {shorten(FCC_TEE_ADDRESS)}
        </a>
        <span>Policy version {snap?.state.policyVersion.toString() ?? "—"}</span>
        <span>Authorization nonce {snap?.state.nonce.toString() ?? "—"}</span>
      </div>
    </div>
  );
}

function Signal({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof LockKeyholeIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
