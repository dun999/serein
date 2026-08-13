"use client";

import { formatFxrp, formatUsd } from "@covenant/sdk";
import { FingerprintIcon, KeyRoundIcon, LockKeyholeIcon, RadioTowerIcon } from "lucide-react";

import { Stat } from "@/components/app/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FCC_TEE_ADDRESS, VAULT_FACTORY_ADDRESS, explorerAddress, shorten } from "@/lib/chain";
import { useTreasury } from "@/lib/treasury-provider";

export function OverviewSection() {
  const { vault, vaults, snap, adopt } = useTreasury();
  const policy = snap?.policy;

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
          <div className="grid gap-6 sm:grid-cols-3">
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
