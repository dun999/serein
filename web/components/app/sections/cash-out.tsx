"use client";

import { formatFxrp, formatUsd, parseFxrp } from "@covenant/sdk";
import { LockIcon, ShieldAlertIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { AmountForm } from "@/components/app/forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCovenant } from "@/lib/covenant-provider";
import { useTreasury } from "@/lib/treasury-provider";

export function CashOutSection() {
  const { vaultClient } = useCovenant();
  const { vault, snap, busy, run, forgetPolicy } = useTreasury();
  const locked = snap?.state.status === "locked";
  const [minimumRedeem, setMinimumRedeem] = useState<bigint | null>(null);

  useEffect(() => {
    if (!vaultClient) return;
    let active = true;
    void vaultClient.minimumRedeemAmount().then(
      (amount) => {
        if (active) setMinimumRedeem(amount);
      },
      () => {
        if (active) setMinimumRedeem(null);
      },
    );
    return () => {
      active = false;
    };
  }, [vaultClient]);

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <ShieldCheckIcon />
        <AlertTitle>Committed XRPL destination</AlertTitle>
        <AlertDescription>
          Redemption can only settle at <span className="font-mono text-xs">{snap?.state.xrplPayout ?? "—"}</span>.
          The browser and FCC request cannot substitute another address.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Redeem FXRP to native XRP</CardTitle>
            <CardDescription>
              Every redemption requires your enrolled passkey. It is not limited by merchant
              payment caps because the destination is permanently restricted to your saved XRPL
              address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmountForm
              id="redeemAmount"
              label="Amount to redeem"
              action="Authorize and redeem"
              busy={busy === "redeem"}
              disabled={!vault || !snap || !vaultClient || locked}
              hint={`FXRP · minimum ${minimumRedeem === null ? "—" : formatFxrp(minimumRedeem)} · available ${snap ? formatFxrp(snap.state.balance) : "—"}`}
              onSubmit={(raw) =>
                run("redeem", async () => {
                  if (!vault || !snap || !vaultClient) throw new Error("Vault is not ready");
                  const amount = parseFxrp(raw);
                  if (minimumRedeem !== null && amount < minimumRedeem) {
                    throw new Error(`FAssets currently requires at least ${formatFxrp(minimumRedeem)} FXRP`);
                  }
                  if (!snap.passkey) {
                    throw new Error("This redemption requires the passkey enrolled with the private policy");
                  }
                  const result = await vaultClient.redeemToXrp({
                    vault,
                    amount,
                    passkey: snap.passkey,
                  });
                  return {
                    kind: "done",
                    message: `${raw} FXRP (${formatUsd(result.authorization.amountUsd)}) entered FAssets redemption.`,
                    instructionHash: result.authorization.instructionTransaction,
                    hash: result.transaction,
                    authorization: result.authorization,
                  };
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emergency recovery</CardTitle>
            <CardDescription>
              If the FCC machine is unavailable, lock the vault and start a delayed full redemption
              to the same XRPL address. A guardian can cancel it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!vault || !vaultClient || busy !== null || locked}
                onClick={() =>
                  run("lock", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.lock(vault);
                    return { kind: "done", message: "Vault locked. Normal movement is disabled.", hash };
                  })
                }
              >
                {busy === "lock" ? <Spinner data-icon="inline-start" /> : <LockIcon data-icon="inline-start" />}
                Lock vault
              </Button>
              <Button
                variant="outline"
                disabled={!vault || !vaultClient || busy !== null || !locked}
                onClick={() =>
                  run("schedule-recovery", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.scheduleRecovery(vault);
                    return { kind: "done", message: "Recovery delay started. The guardian may cancel it.", hash };
                  })
                }
              >
                {busy === "schedule-recovery" ? <Spinner data-icon="inline-start" /> : null}
                Schedule recovery
              </Button>
              <Button
                disabled={!vault || !vaultClient || busy !== null || !locked}
                onClick={() =>
                  run("execute-recovery", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.executeRecovery(vault);
                    return { kind: "done", message: "The full balance entered recovery redemption.", hash };
                  })
                }
              >
                {busy === "execute-recovery" ? <Spinner data-icon="inline-start" /> : null}
                Execute after delay
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Destroy vault</CardTitle>
            <CardDescription>
              Permanently close this contract and return its complete FXRP balance to the owner
              wallet. The action requires the passkey enrolled in the current private policy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    disabled={!vault || !snap?.passkey || busy !== null || locked}
                  />
                }
              >
                <Trash2Icon data-icon="inline-start" />
                Destroy vault
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="text-destructive">
                    <ShieldAlertIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Permanently destroy this vault?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {snap ? formatFxrp(snap.state.balance) : "—"} FXRP will be returned to the
                    connected owner wallet. The vault cannot be unlocked or reused. Continuing
                    opens Google Password Manager or your device&apos;s passkey provider for user
                    verification.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep vault</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("destroy-vault", async () => {
                        if (!vault || !vaultClient || !snap?.passkey) {
                          throw new Error("Vault and its enrolled passkey are required");
                        }
                        const result = await vaultClient.destroyVault({
                          vault,
                          passkey: snap.passkey,
                        });
                        forgetPolicy(vault);
                        return {
                          kind: "done",
                          message: "Passkey verified. The vault is permanently closed and its full FXRP balance was returned to the owner wallet.",
                          instructionHash: result.authorization.instructionTransaction,
                          authorization: result.authorization,
                          hash: result.transaction,
                        };
                      })
                    }
                  >
                    {busy === "destroy-vault" ? <Spinner data-icon="inline-start" /> : null}
                    Verify and destroy
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
