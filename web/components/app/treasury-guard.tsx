"use client";

import {
  isValidXrplClassicAddress,
  parseUsd,
  registerPasskey,
  type PrivatePolicy,
} from "@covenant/sdk";
import { AlertCircleIcon, ServerCogIcon } from "lucide-react";
import { getAddress, isAddress, toBytes, type Address } from "viem";

import { OpenVaultForm, OutcomePanel, type OpenVaultValues } from "@/components/app/forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCovenant } from "@/lib/covenant-provider";
import { useTreasury } from "@/lib/treasury-provider";

export function TreasuryGuard({ children }: { children: React.ReactNode }) {
  const {
    address,
    chainOk,
    connect,
    connecting,
    vaultClient,
    teeAddress,
    deploymentReady,
    error,
  } = useCovenant();
  const {
    vault,
    snap,
    busy,
    outcome,
    run,
    adopt,
    rememberPolicy,
    startNewVault,
  } = useTreasury();

  if (!deploymentReady) {
    return (
      <Alert>
        <ServerCogIcon />
        <AlertTitle>Private-vault deployment is not configured</AlertTitle>
        <AlertDescription>
          Deploy the factory and FCC instruction sender, register the extension, then set the
          public FCC, vault, and FAssets deployment values documented in .env.example. The
          <a className="ml-1 underline underline-offset-2" href="/api/status" target="_blank" rel="noreferrer">
            deployment health endpoint
          </a>
          identifies every missing check.
        </AlertDescription>
      </Alert>
    );
  }

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect a wallet</CardTitle>
          <CardDescription>
            Your wallet proposes actions; registered Flare Confidential Compute must authorize
            them before FXRP can leave.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <Button onClick={connect} disabled={connecting}>
            {connecting ? <Spinner data-icon="inline-start" /> : null}
            Connect
          </Button>
          <p className="text-xs text-muted-foreground">
            Coston2 uses C2FLR for gas. FXRP is created from XRP through FAssets, not a mock token.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Wallet connection unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!chainOk) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Wrong network</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>This vault is deployed on Flare Coston2.</span>
          <Button size="sm" onClick={connect}>Switch to Coston2</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (vault === null) {
    return (
      <div className="flex flex-col gap-4">
        <OpenVaultForm
          busy={busy === "open"}
          onOpen={(values) =>
            run("open", async () => {
              if (!vaultClient) throw new Error("Wallet client is not ready");
              const policy = await buildPolicy(address, values);
              const created = await vaultClient.createVault({
                tee: teeAddress,
                guardian: optionalAddress(values.guardian),
                timelockSeconds: 86_400,
                xrplPayout: values.xrplPayout.trim(),
              });
              rememberPolicy(created.vault, policy);
              await adopt(created.vault);
              const policyHash = await vaultClient.initializePolicy({
                vault: created.vault,
                policy,
              });
              await adopt(created.vault);
              return {
                kind: "done",
                message: "Private vault deployed, passkey enrolled, and encrypted policy committed.",
                hash: policyHash,
                instructionHash: created.transaction,
              };
            })
          }
        />
        {outcome ? <OutcomePanel outcome={outcome} /> : null}
      </div>
    );
  }

  if (snap?.state.status === "destroyed") {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Vault permanently closed</CardTitle>
            <CardDescription>
              Its complete FXRP balance was returned to the owner wallet and its encrypted
              policy was removed. This contract cannot become active again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startNewVault}>Create another vault</Button>
          </CardContent>
        </Card>
        {outcome ? <OutcomePanel outcome={outcome} /> : null}
      </div>
    );
  }

  if (vault && snap?.state.policyVersion === 0n) {
    if (snap.policy) {
      return (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Finish vault setup</CardTitle>
              <CardDescription>
                The isolated vault was deployed, but the policy transaction did not complete.
                Your encrypted policy can be retried without deploying another vault.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                disabled={!vaultClient || busy !== null}
                onClick={() =>
                  run("initialize-policy", async () => {
                    if (!vaultClient) throw new Error("Wallet client is not ready");
                    const hash = await vaultClient.initializePolicy({
                      vault,
                      policy: snap.policy!,
                    });
                    await adopt(vault);
                    return { kind: "done", message: "Encrypted policy committed. The vault is ready.", hash };
                  })
                }
              >
                {busy === "initialize-policy" ? <Spinner data-icon="inline-start" /> : null}
                Retry policy transaction
              </Button>
            </CardContent>
          </Card>
          {outcome ? <OutcomePanel outcome={outcome} /> : null}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <OpenVaultForm
          resume
          busy={busy === "initialize-policy"}
          onOpen={(values) =>
            run("initialize-policy", async () => {
              if (!vaultClient) throw new Error("Wallet client is not ready");
              const policy = await buildPolicy(address, values);
              const hash = await vaultClient.initializePolicy({ vault, policy });
              rememberPolicy(vault, policy);
              await adopt(vault);
              return { kind: "done", message: "Encrypted policy committed. The vault is ready.", hash };
            })
          }
        />
        {outcome ? <OutcomePanel outcome={outcome} /> : null}
      </div>
    );
  }

  return (
    <>
      {children}
      {outcome ? <OutcomePanel outcome={outcome} /> : null}
    </>
  );
}

async function buildPolicy(owner: Address, values: OpenVaultValues): Promise<PrivatePolicy> {
  const payee = values.payee.trim();
  if (payee && !isAddress(payee)) throw new Error("The approved recipient is not an EVM address");
  if (values.guardian.trim() && !isAddress(values.guardian.trim())) {
    throw new Error("The guardian is not an EVM address");
  }
  if (!isValidXrplClassicAddress(values.xrplPayout.trim())) {
    throw new Error("The XRPL recovery destination must be a checksum-valid classic r-address");
  }
  const passkey = await registerPasskey({
    name: values.name,
    userId: toBytes(owner),
    userName: owner,
    rpId: window.location.hostname,
    origin: window.location.origin,
  });
  return {
    version: 1,
    name: values.name,
    perTxCapUsd: parseUsd(values.perTx).toString(),
    dailyCapUsd: parseUsd(values.daily).toString(),
    stepUpThresholdUsd: parseUsd(values.stepUp).toString(),
    allowedRecipients: payee
      ? [{ address: getAddress(payee), label: values.payeeLabel.trim() || undefined }]
      : [],
    webAuthn: passkey,
  };
}

function optionalAddress(value: string): Address | undefined {
  const trimmed = value.trim();
  return trimmed ? getAddress(trimmed) : undefined;
}
