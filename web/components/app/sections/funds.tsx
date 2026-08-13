"use client";

import {
  directMintMemo,
  directMintNetAmount,
  formatFxrp,
  parseFxrp,
  type DirectMintSettings,
} from "@covenant/sdk";
import { CopyIcon, ExternalLinkIcon, RadioTowerIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AmountForm } from "@/components/app/forms";
import { EvidenceTimeline, type EvidenceStep } from "@/components/app/evidence-timeline";
import { Stat } from "@/components/app/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCovenant } from "@/lib/covenant-provider";
import { explorerAddress } from "@/lib/chain";
import { useTreasury } from "@/lib/treasury-provider";

type XamanState =
  | "sign"
  | "waiting"
  | "signed"
  | "minted"
  | "rejected"
  | "expired"
  | "wrong-network"
  | "invalid";

interface XamanRequest {
  uuid: string;
  deeplink: string;
  vault: string;
  balanceBefore: string;
  expectedNet: string;
  state: XamanState;
  transaction?: string;
}

export function FundsSection() {
  const { vaultClient } = useCovenant();
  const { vault, snap, busy, run, refresh } = useTreasury();
  const memo = vault ? directMintMemo(vault) : null;
  const [mintSettings, setMintSettings] = useState<DirectMintSettings | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [xaman, setXaman] = useState<XamanRequest | null>(null);
  const [hydratedVault, setHydratedVault] = useState<string | null>(null);
  const xamanUuid = xaman?.uuid;
  const xamanState = xaman?.state;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!vault) {
        setXaman(null);
        setHydratedVault(null);
        return;
      }
      setXaman(readStoredXaman(vault));
      setHydratedVault(vault.toLowerCase());
    });
    return () => {
      active = false;
    };
  }, [vault]);

  useEffect(() => {
    if (!vault || hydratedVault !== vault.toLowerCase()) return;
    const key = xamanStorageKey(vault);
    if (xaman && xaman.vault.toLowerCase() === vault.toLowerCase()) {
      localStorage.setItem(key, JSON.stringify(xaman));
    } else {
      localStorage.removeItem(key);
    }
  }, [hydratedVault, vault, xaman]);

  useEffect(() => {
    if (!vaultClient) return;
    let active = true;
    void vaultClient.directMintSettings().then(
      (settings) => {
        if (active) setMintSettings(settings);
      },
      (error) => {
        if (active) setMintError(error instanceof Error ? error.message : "Could not read FAssets settings");
      },
    );
    return () => {
      active = false;
    };
  }, [vaultClient]);

  useEffect(() => {
    if (!xamanUuid || isXamanTerminal(xamanState)) return;
    let active = true;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/xaman/payload/${xamanUuid}`);
        const result = (await response.json()) as {
          status?: "pending" | "confirming" | "submitted" | "rejected" | "expired" | "wrong-network" | "invalid";
          signed?: boolean;
          cancelled?: boolean;
          transaction?: string;
        };
        if (!active) return;
        if (result.signed) {
          setXaman((current) => current ? { ...current, state: "signed", transaction: result.transaction } : null);
          if (vault) await refresh(vault);
          return;
        }
        const failureStatus = result.status;
        if (failureStatus === "rejected" || failureStatus === "expired" || failureStatus === "wrong-network" || failureStatus === "invalid") {
          setXaman((current) => current ? { ...current, state: failureStatus } : null);
          return;
        }
        if (result.cancelled) {
          setXaman((current) => current ? { ...current, state: "rejected" } : null);
          return;
        }
        setXaman((current) => current
          ? { ...current, state: "waiting", transaction: result.transaction ?? current.transaction }
          : null);
      } catch {
        // A transient poll failure must not discard a signing request.
      }
      if (active) timer = window.setTimeout(poll, 2_000);
    };
    timer = window.setTimeout(poll, 1_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [xamanUuid, xamanState, refresh, vault]);

  useEffect(() => {
    if (xamanState !== "signed" || !xaman || !vault || !vaultClient) return;
    if (xaman.vault.toLowerCase() !== vault.toLowerCase()) return;
    let active = true;
    let timer = 0;
    const checkMint = async () => {
      try {
        const state = await vaultClient.getState(vault);
        if (!active) return;
        const expectedBalance = BigInt(xaman.balanceBefore) + BigInt(xaman.expectedNet);
        if (state.balance >= expectedBalance) {
          setXaman((current) => current ? { ...current, state: "minted" } : null);
          await refresh(vault);
          return;
        }
      } catch {
        // FDC/executor completion can take time; retry without losing evidence.
      }
      if (active) timer = window.setTimeout(checkMint, 4_000);
    };
    void checkMint();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refresh, vault, vaultClient, xaman, xamanState]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Stat label="Wallet balance" value={snap ? `${formatFxrp(snap.walletFxrp)} FXRP` : "—"} hint="not yet protected" />
        <Stat label="Vault balance" value={snap ? `${formatFxrp(snap.state.balance)} FXRP` : "—"} hint="governed by private policy" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Move existing FXRP</CardTitle>
            <CardDescription>
              Approve this isolated vault, then transfer FXRP into it. The approval cannot move
              funds back out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmountForm
              id="depositAmount"
              label="Amount to protect"
              action="Approve and deposit"
              busy={busy === "deposit"}
              disabled={!vault || !vaultClient || snap?.state.status === "locked"}
              onSubmit={(raw) =>
                run("deposit", async () => {
                  if (!vault || !vaultClient) throw new Error("Vault is not ready");
                  const amount = parseFxrp(raw);
                  await vaultClient.approveFxrp(vault, amount);
                  const hash = await vaultClient.deposit(vault, amount);
                  return { kind: "done", message: `${raw} FXRP is now protected.`, hash };
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Direct-mint XRP into this vault</CardTitle>
            <CardDescription>
              Send XRP to the FAssets Core Vault with this 32-byte memo. FDC verification credits
              the resulting FXRP directly to the Serein vault—no intermediate wallet custody.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AmountForm
              id="directMintAmount"
              label="XRP to send"
              action="Create Xaman payment"
              busy={busy === "direct-mint"}
              disabled={!vault || !mintSettings}
              hint={
                mintSettings
                  ? `Core Vault ${mintSettings.paymentAddress} · executor fee ${formatFxrp(mintSettings.executorFeeUba)} XRP`
                  : "Reading current FAssets Core Vault and fees…"
              }
              onSubmit={(raw) =>
                run("direct-mint", async () => {
                  if (!vault || !mintSettings) throw new Error("Direct mint is not ready");
                  const amountDrops = parseFxrp(raw);
                  const net = directMintNetAmount(
                    amountDrops,
                    mintSettings.feeBips,
                    mintSettings.minimumFeeUba,
                    mintSettings.executorFeeUba,
                  );
                  if (net === 0n) throw new Error("This XRP amount is too small after FAssets fees");
                  const response = await fetch("/api/xaman/direct-mint", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ recipient: vault, amountDrops: amountDrops.toString() }),
                  });
                  const result = (await response.json()) as {
                    uuid?: string;
                    deeplink?: string;
                    error?: string;
                  };
                  if (!response.ok || !result.uuid || !result.deeplink) {
                    throw new Error(result.error ?? "Could not create the Xaman payment");
                  }
                  setXaman({
                    uuid: result.uuid,
                    deeplink: result.deeplink,
                    vault,
                    balanceBefore: (snap?.state.balance ?? 0n).toString(),
                    expectedNet: net.toString(),
                    state: "sign",
                  });
                  return {
                    kind: "done",
                    message: `Xaman request created. About ${formatFxrp(net)} FXRP will mint to the vault after fees and FDC execution.`,
                  };
                })
              }
            />

            {xaman ? (
              <Alert>
                <RadioTowerIcon />
                <AlertTitle>
                  {xaman.state === "signed"
                    ? "XRPL Testnet payment verified"
                    : xaman.state === "minted"
                      ? "FXRP minted into the vault"
                      : xamanFailureTitle(xaman.state) ?? "Approve the XRP payment in Xaman"}
                </AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <span>
                    {xaman.state === "minted"
                      ? `${formatFxrp(BigInt(xaman.expectedNet))} FXRP arrived in the protected vault after fees.`
                      : xaman.state === "signed"
                      ? "FDC and the direct-mint executor now complete the FXRP mint to this vault."
                      : xamanFailureDetail(xaman.state)
                        ? xamanFailureDetail(xaman.state)
                        : "The destination and 32-byte vault memo were constructed from live AssetManager state."}
                  </span>
                  <EvidenceTimeline steps={xamanSteps(xaman)} />
                  {xaman.state === "sign" || xaman.state === "waiting" ? (
                    <Button nativeButton={false} render={<a href={xaman.deeplink} target="_blank" rel="noreferrer" />}>
                      Open Xaman
                      <ExternalLinkIcon data-icon="inline-end" />
                    </Button>
                  ) : xaman.transaction ? (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={
                        <a
                          href={`https://testnet.xrpl.org/transactions/${xaman.transaction}`}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      XRPL transaction
                      <ExternalLinkIcon data-icon="inline-end" />
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            <code className="rounded bg-muted px-3 py-2 font-mono text-xs break-all">
              {memo ?? "Create a vault to generate its direct-mint memo."}
            </code>
            {mintError ? <p className="text-xs text-destructive">{mintError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => memo && navigator.clipboard.writeText(memo)}
                disabled={!memo}
              >
                <CopyIcon data-icon="inline-start" />
                Copy memo
              </Button>
              {vault ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={explorerAddress(vault)} target="_blank" rel="noreferrer" />}
                >
                  Vault address
                  <ExternalLinkIcon data-icon="inline-end" />
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function xamanSteps(xaman: XamanRequest): EvidenceStep[] {
  const failure = xamanFailureDetail(xaman.state);
  if (failure) {
    return [
      { label: "XRPL payment", detail: failure, state: "not-sent" },
      { label: "FDC verification", detail: "No XRPL payment is available to prove", state: "not-sent" },
      { label: "FXRP direct mint", detail: "No FXRP was minted from this request", state: "not-sent" },
    ];
  }
  const xrplComplete = xaman.state === "signed" || xaman.state === "minted";
  const mintComplete = xaman.state === "minted";
  return [
    {
      label: "XRPL payment",
      detail: xrplComplete && xaman.transaction ? "Open the submitted XRPL transaction" : "Waiting for approval in Xaman",
      state: xrplComplete ? "complete" : "pending",
      ...(xrplComplete && xaman.transaction
        ? { href: `https://testnet.xrpl.org/transactions/${xaman.transaction}` }
        : {}),
    },
    {
      label: "FDC verification",
      detail: mintComplete ? "FDC payment proof accepted by FAssets" : "FAssets verifies the XRPL payment proof",
      state: mintComplete ? "complete" : "pending",
    },
    {
      label: "FXRP direct mint",
      detail: mintComplete
        ? `${formatFxrp(BigInt(xaman.expectedNet))} FXRP arrived in the isolated vault`
        : "FXRP will arrive at the isolated vault after execution",
      state: mintComplete ? "complete" : "pending",
    },
  ];
}

function isXamanTerminal(state: XamanState | undefined): boolean {
  return state === "signed" || state === "minted" || Boolean(xamanFailureDetail(state));
}

function xamanFailureTitle(state: XamanState): string | null {
  if (state === "rejected") return "Xaman request rejected";
  if (state === "expired") return "Xaman request expired";
  if (state === "wrong-network") return "Wrong XRPL network";
  if (state === "invalid") return "XRPL payment could not be verified";
  return null;
}

function xamanFailureDetail(state: XamanState | undefined): string | null {
  if (state === "rejected") return "The signing request was rejected in Xaman";
  if (state === "expired") return "The signing request expired before a payment was signed";
  if (state === "wrong-network") return "The payment was not dispatched to XRPL Testnet";
  if (state === "invalid") return "The submitted transaction did not match the requested Testnet payment";
  return null;
}

function xamanStorageKey(vault: string): string {
  return `serein:direct-mint:${vault.toLowerCase()}`;
}

function readStoredXaman(vault: string): XamanRequest | null {
  try {
    const stored = localStorage.getItem(xamanStorageKey(vault));
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<XamanRequest>;
    if (
      typeof value.uuid !== "string" ||
      typeof value.deeplink !== "string" ||
      typeof value.vault !== "string" ||
      value.vault.toLowerCase() !== vault.toLowerCase() ||
      typeof value.balanceBefore !== "string" ||
      !/^\d+$/.test(value.balanceBefore) ||
      typeof value.expectedNet !== "string" ||
      !/^[1-9]\d*$/.test(value.expectedNet) ||
      !isStoredXamanState(value.state)
    ) return null;
    return value as XamanRequest;
  } catch {
    return null;
  }
}

function isStoredXamanState(value: unknown): value is XamanState {
  return ["sign", "waiting", "signed", "minted", "rejected", "expired", "wrong-network", "invalid"].includes(String(value));
}
