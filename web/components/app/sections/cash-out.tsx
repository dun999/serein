"use client";

import {
  formatFxrp,
  formatUsd,
  parseFxrp,
  type FccAdminAuthorization,
  type FccAuthorization,
} from "@covenant/sdk";
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
  const [preparedRedeem, setPreparedRedeem] = useState<{
    vault: `0x${string}`;
    amount: bigint;
    rawAmount: string;
    authorization: FccAuthorization;
  } | null>(null);
  const [preparedDestroy, setPreparedDestroy] = useState<{
    vault: `0x${string}`;
    authorization: FccAdminAuthorization;
  } | null>(null);
  const [destroyDialogOpen, setDestroyDialogOpen] = useState(false);
  const pendingRedeem = preparedRedeem?.vault === vault ? preparedRedeem : null;
  const pendingDestroy = preparedDestroy?.vault === vault ? preparedDestroy : null;

  // Both escape hatches sit behind the vault's timelock. Track the clock so the
  // controls open exactly when the contract will accept them, instead of
  // letting a click revert with a bare "reverted" message.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const recoveryAt = Number(snap?.state.recoveryAt ?? 0n);
  const unlockAt = Number(snap?.state.unlockAt ?? 0n);
  const recoveryScheduled = recoveryAt > 0;
  const recoveryReady = recoveryScheduled && now >= recoveryAt;
  const unlockScheduled = unlockAt > 0;
  const unlockReady = unlockScheduled && now >= unlockAt;
  const timelockLabel = snap ? formatDuration(snap.state.timelockSeconds) : "the vault delay";

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
              action="Authorize redemption"
              busy={busy === "authorize-redeem"}
              disabled={!vault || !snap || !vaultClient || locked || pendingRedeem !== null}
              hint={`FXRP · minimum ${minimumRedeem === null ? "—" : formatFxrp(minimumRedeem)} · available ${snap ? formatFxrp(snap.state.balance) : "—"}`}
              onSubmit={(raw) =>
                run("authorize-redeem", async () => {
                  if (!vault || !snap || !vaultClient) throw new Error("Vault is not ready");
                  const amount = parseFxrp(raw);
                  if (minimumRedeem !== null && amount < minimumRedeem) {
                    throw new Error(`FAssets currently requires at least ${formatFxrp(minimumRedeem)} FXRP`);
                  }
                  if (!snap.passkey) {
                    throw new Error("This redemption requires the passkey enrolled with the private policy");
                  }
                  const authorization = await vaultClient.authorizeRedeem({
                    vault,
                    amount,
                    passkey: snap.passkey,
                  });
                  setPreparedRedeem({ vault, amount, rawAmount: raw, authorization });
                  return {
                    kind: "ready",
                    message: `${raw} FXRP (${formatUsd(authorization.amountUsd)}) was approved for redemption. Click Execute redemption to open the wallet transaction.`,
                    instructionHash: authorization.instructionTransaction,
                    authorization,
                  };
                })
              }
            />
            {pendingRedeem ? (
              <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
                <Button
                  onClick={() =>
                    run("execute-redeem", async () => {
                      if (!vaultClient) throw new Error("Vault is not ready");
                      const hash = await vaultClient.executeRedeem(pendingRedeem);
                      const authorization = pendingRedeem.authorization;
                      const rawAmount = pendingRedeem.rawAmount;
                      setPreparedRedeem(null);
                      return {
                        kind: "done",
                        message: `${rawAmount} FXRP entered FAssets redemption to your committed XRPL address.`,
                        instructionHash: authorization.instructionTransaction,
                        authorization,
                        hash,
                      };
                    })
                  }
                  disabled={busy !== null}
                >
                  {busy === "execute-redeem" ? <Spinner data-icon="inline-start" /> : null}
                  Execute redemption
                </Button>
                <Button variant="outline" onClick={() => setPreparedRedeem(null)} disabled={busy !== null}>
                  Discard authorization
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lock and emergency recovery</CardTitle>
            <CardDescription>
              Locking stops all movement immediately. Reopening the vault, and the escape hatch
              that redeems everything to the saved XRPL address, both wait out the {timelockLabel}{" "}
              delay. A guardian can cancel a pending recovery.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {!locked
                ? "The vault is active. Lock it only if the FCC machine or your wallet is compromised."
                : recoveryReady
                  ? "The recovery delay has elapsed. Executing now redeems the whole balance to the saved XRPL address."
                  : recoveryScheduled
                    ? `Recovery unlocks in ${formatCountdown(recoveryAt - now)}.`
                    : unlockReady
                      ? "The unlock delay has elapsed. Confirm below to make the vault active again."
                      : unlockScheduled
                        ? `Unlock can be confirmed in ${formatCountdown(unlockAt - now)}.`
                        : "The vault is locked. Start an unlock to reopen it, or start recovery to exit to XRP."}
            </p>
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
                disabled={!vault || !vaultClient || busy !== null || !locked || unlockScheduled}
                onClick={() =>
                  run("schedule-unlock", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.scheduleUnlock(vault);
                    return {
                      kind: "done",
                      message: `Unlock delay started. Confirm it after ${timelockLabel}.`,
                      hash,
                    };
                  })
                }
              >
                {busy === "schedule-unlock" ? <Spinner data-icon="inline-start" /> : null}
                Start unlock
              </Button>
              <Button
                variant="outline"
                disabled={!vault || !vaultClient || busy !== null || !locked || !unlockReady}
                onClick={() =>
                  run("confirm-unlock", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.confirmUnlock(vault);
                    return { kind: "done", message: "The vault is active again.", hash };
                  })
                }
              >
                {busy === "confirm-unlock" ? <Spinner data-icon="inline-start" /> : null}
                Confirm unlock
              </Button>
              <Button
                variant="outline"
                disabled={!vault || !vaultClient || busy !== null || !locked || recoveryScheduled}
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
              {recoveryScheduled ? (
                <Button
                  variant="outline"
                  disabled={!vault || !vaultClient || busy !== null}
                  onClick={() =>
                    run("cancel-recovery", async () => {
                      if (!vault || !vaultClient) throw new Error("Vault is not ready");
                      const hash = await vaultClient.cancelRecovery(vault);
                      return { kind: "done", message: "The pending recovery was cancelled.", hash };
                    })
                  }
                >
                  {busy === "cancel-recovery" ? <Spinner data-icon="inline-start" /> : null}
                  Cancel recovery
                </Button>
              ) : null}
              <Button
                disabled={!vault || !vaultClient || busy !== null || !recoveryReady}
                onClick={() =>
                  run("execute-recovery", async () => {
                    if (!vault || !vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.executeRecovery(vault);
                    return { kind: "done", message: "The full balance entered recovery redemption.", hash };
                  })
                }
              >
                {busy === "execute-recovery" ? <Spinner data-icon="inline-start" /> : null}
                {recoveryScheduled && !recoveryReady
                  ? `Execute in ${formatCountdown(recoveryAt - now)}`
                  : "Execute recovery"}
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
            <AlertDialog open={destroyDialogOpen} onOpenChange={setDestroyDialogOpen}>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    disabled={!vault || !snap?.passkey || busy !== null || locked || pendingDestroy !== null}
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
                    onClick={() => {
                      setDestroyDialogOpen(false);
                      void run("authorize-destroy", async () => {
                        if (!vault || !vaultClient || !snap?.passkey) {
                          throw new Error("Vault and its enrolled passkey are required");
                        }
                        const authorization = await vaultClient.authorizeDestroy({
                          vault,
                          passkey: snap.passkey,
                        });
                        setPreparedDestroy({ vault, authorization });
                        return {
                          kind: "ready",
                          message: "Passkey verified and FCC authorized the destruction. Click Execute destruction to open the final wallet transaction.",
                          instructionHash: authorization.instructionTransaction,
                          authorization,
                        };
                      });
                    }}
                  >
                    {busy === "authorize-destroy" ? <Spinner data-icon="inline-start" /> : null}
                    Verify passkey
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {pendingDestroy ? (
              <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <Button
                  variant="destructive"
                  onClick={() =>
                    run("execute-destroy", async () => {
                      if (!vaultClient) throw new Error("Vault is not ready");
                      const hash = await vaultClient.executeDestroy(pendingDestroy);
                      const authorization = pendingDestroy.authorization;
                      setPreparedDestroy(null);
                      forgetPolicy(pendingDestroy.vault);
                      return {
                        kind: "done",
                        message: "The vault is permanently closed and its full FXRP balance was returned to the owner wallet.",
                        instructionHash: authorization.instructionTransaction,
                        authorization,
                        hash,
                      };
                    })
                  }
                  disabled={busy !== null}
                >
                  {busy === "execute-destroy" ? <Spinner data-icon="inline-start" /> : null}
                  Execute destruction
                </Button>
                <Button variant="outline" onClick={() => setPreparedDestroy(null)} disabled={busy !== null}>
                  Discard authorization
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Renders a timelock length, which the contract bounds to 1–30 days. */
function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86_400);
  if (days >= 1) return days === 1 ? "1 day" : `${days} days`;
  const hours = Math.max(1, Math.round(seconds / 3_600));
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Renders the time still to wait, down to seconds as it approaches zero. */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "a moment";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
