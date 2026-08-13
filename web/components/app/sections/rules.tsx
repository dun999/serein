"use client";

import {
  formatUsd,
  parseUsd,
  type PreparedPolicyProposal,
  type PrivatePolicy,
  type PrivateRecipient,
} from "@covenant/sdk";
import { Clock3Icon, LockKeyholeIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { getAddress, isAddress } from "viem";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useCovenant } from "@/lib/covenant-provider";
import { useTreasury } from "@/lib/treasury-provider";

export function RulesSection() {
  const { vaultClient } = useCovenant();
  const { vault, snap, busy, run, rememberPolicy } = useTreasury();
  const active = snap?.policy;
  const [preparedUpdate, setPreparedUpdate] = useState<{
    vault: `0x${string}`;
    policy: PrivatePolicy;
    prepared: PreparedPolicyProposal;
  } | null>(null);
  const pendingUpdate = preparedUpdate?.vault === vault ? preparedUpdate : null;

  if (!active) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Private policy unavailable on this device</CardTitle>
          <CardDescription>
            The chain intentionally contains only encrypted policy data. Import or recreate the
            local policy metadata before editing it. The contract still requires the currently
            enrolled passkey and FCC authorization for every replacement.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Confidential policy</CardTitle>
              <CardDescription>
                The plaintext below stays in this browser and inside FCC. Only its hash and
                encrypted envelope are written to Flare. Updating it always requires the current
                passkey; a wallet-only contract call is rejected.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              <LockKeyholeIcon data-icon="inline-start" />
              Version {snap?.state.policyVersion.toString() ?? "—"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <PolicyEditor
            key={`${vault}:${snap?.state.policyVersion.toString()}`}
            policy={active}
            busy={busy}
            authorizationReady={pendingUpdate !== null}
            onPropose={(next) =>
              run("authorize-policy", async () => {
                if (!vault || !vaultClient) throw new Error("Vault is not ready");
                if (!snap?.passkey) {
                  throw new Error("The current policy passkey is required to replace vault rules");
                }
                const prepared = await vaultClient.authorizePolicyProposal({
                  vault,
                  policy: next,
                  passkey: snap.passkey,
                });
                setPreparedUpdate({ vault, policy: next, prepared });
                return {
                  kind: "ready",
                  message: "Passkey verified and FCC authorized this encrypted update. Click Submit authorized update to open the wallet transaction.",
                  instructionHash: prepared.authorization.instructionTransaction,
                  authorization: prepared.authorization,
                };
              })
            }
            onApply={() =>
              run("apply-policy", async () => {
                if (!vault || !vaultClient) throw new Error("Vault is not ready");
                const hash = await vaultClient.applyPolicy(vault);
                const pending = localStorage.getItem(pendingKey(vault));
                if (pending) {
                  rememberPolicy(vault, JSON.parse(pending) as PrivatePolicy);
                  localStorage.removeItem(pendingKey(vault));
                }
                return { kind: "done", message: "The new confidential policy is active.", hash };
              })
            }
            onCancel={() =>
              run("cancel-policy", async () => {
                if (!vault || !vaultClient) throw new Error("Vault is not ready");
                const hash = await vaultClient.cancelPolicyProposal(vault);
                localStorage.removeItem(pendingKey(vault));
                return { kind: "done", message: "Pending policy update cancelled.", hash };
              })
            }
          />
          {pendingUpdate ? (
            <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <Button
                onClick={() =>
                  run("execute-policy", async () => {
                    if (!vaultClient) throw new Error("Vault is not ready");
                    const hash = await vaultClient.executePolicyProposal({
                      vault: pendingUpdate.vault,
                      prepared: pendingUpdate.prepared,
                    });
                    const authorization = pendingUpdate.prepared.authorization;
                    localStorage.setItem(pendingKey(pendingUpdate.vault), JSON.stringify(pendingUpdate.policy));
                    setPreparedUpdate(null);
                    return {
                      kind: "done",
                      message: "The encrypted policy update was proposed. It becomes eligible after the vault timelock.",
                      instructionHash: authorization.instructionTransaction,
                      authorization,
                      hash,
                    };
                  })
                }
                disabled={busy !== null}
              >
                {busy === "execute-policy" ? <Spinner data-icon="inline-start" /> : null}
                Submit authorized update
              </Button>
              <Button variant="outline" onClick={() => setPreparedUpdate(null)} disabled={busy !== null}>
                Discard authorization
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <PolicyFigure label="Per payment" value={formatUsd(BigInt(active.perTxCapUsd))} />
        <PolicyFigure label="Per day" value={formatUsd(BigInt(active.dailyCapUsd))} />
        <PolicyFigure label="Passkey above" value={formatUsd(BigInt(active.stepUpThresholdUsd))} />
      </div>
    </div>
  );
}

function PolicyEditor({
  policy,
  busy,
  authorizationReady,
  onPropose,
  onApply,
  onCancel,
}: {
  policy: PrivatePolicy;
  busy: string | null;
  authorizationReady: boolean;
  onPropose: (policy: PrivatePolicy) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [perTx, setPerTx] = useState(() => dollars(policy.perTxCapUsd));
  const [daily, setDaily] = useState(() => dollars(policy.dailyCapUsd));
  const [stepUp, setStepUp] = useState(() => dollars(policy.stepUpThresholdUsd));
  const [recipients, setRecipients] = useState<PrivateRecipient[]>(policy.allowedRecipients);
  const [recipient, setRecipient] = useState("");
  const [label, setLabel] = useState("");

  const build = (): PrivatePolicy => ({
    ...policy,
    perTxCapUsd: parseUsd(perTx).toString(),
    dailyCapUsd: parseUsd(daily).toString(),
    stepUpThresholdUsd: parseUsd(stepUp).toString(),
    allowedRecipients: recipients,
  });

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-3">
          <PolicyMoneyField id="policyPerTx" label="Per payment" value={perTx} onChange={setPerTx} />
          <PolicyMoneyField id="policyDaily" label="Per day" value={daily} onChange={setDaily} />
          <PolicyMoneyField id="policyStepUp" label="Passkey above" value={stepUp} onChange={setStepUp} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_0.7fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="newRecipient">Add recipient</FieldLabel>
            <Input id="newRecipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" className="font-mono text-xs" />
          </Field>
          <Field>
            <FieldLabel htmlFor="newRecipientLabel">Private label</FieldLabel>
            <Input id="newRecipientLabel" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Vendor" />
          </Field>
          <Button
            variant="outline"
            disabled={!isAddress(recipient)}
            onClick={() => {
              if (!isAddress(recipient)) return;
              setRecipients((current) => [
                ...current.filter((item) => item.address.toLowerCase() !== recipient.toLowerCase()),
                { address: getAddress(recipient), label: label.trim() || undefined },
              ]);
              setRecipient("");
              setLabel("");
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Add
          </Button>
        </div>
      </FieldGroup>

      <div className="flex flex-col gap-2">
        {recipients.map((item) => (
          <div key={item.address} className="flex items-center justify-between gap-4 rounded bg-muted px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label ?? "Approved recipient"}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{item.address}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setRecipients((current) => current.filter((entry) => entry.address !== item.address))}>
              <Trash2Icon />
              <span className="sr-only">Remove {item.label ?? item.address}</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onPropose(build())} disabled={busy !== null || authorizationReady}>
          {busy === "authorize-policy" ? <Spinner data-icon="inline-start" /> : <Clock3Icon data-icon="inline-start" />}
          Verify policy update
        </Button>
        <Button variant="outline" onClick={onApply} disabled={busy !== null}>
          {busy === "apply-policy" ? <Spinner data-icon="inline-start" /> : null}
          Apply eligible update
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={busy !== null}>
          Cancel pending update
        </Button>
      </div>
    </div>
  );
}

function PolicyMoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
      <FieldDescription>USD</FieldDescription>
    </Field>
  );
}

function PolicyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded bg-muted px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function dollars(value: string): string {
  const scaled = BigInt(value);
  const whole = scaled / 100_000_000n;
  const fraction = (scaled % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function pendingKey(vault: string): string {
  return `covenant:pending-private-policy:${vault.toLowerCase()}`;
}
