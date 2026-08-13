"use client";

import { CheckCircle2Icon, ShieldXIcon } from "lucide-react";
import { useState } from "react";

import { EvidenceTimeline, type EvidenceStep } from "@/components/app/evidence-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { explorerTx } from "@/lib/chain";
import type { Outcome } from "@/lib/treasury-provider";

export interface OpenVaultValues {
  name: string;
  perTx: string;
  daily: string;
  stepUp: string;
  payee: string;
  payeeLabel: string;
  guardian: string;
  xrplPayout: string;
}

export function OpenVaultForm({
  busy,
  onOpen,
  resume = false,
}: {
  busy: boolean;
  onOpen: (values: OpenVaultValues) => void;
  resume?: boolean;
}) {
  const [values, setValues] = useState<OpenVaultValues>({
    name: "Operations",
    perTx: "250",
    daily: "1000",
    stepUp: "100",
    payee: "",
    payeeLabel: "Primary merchant",
    guardian: "",
    xrplPayout: "",
  });
  const update = (field: keyof OpenVaultValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const complete = values.name && values.perTx && values.daily && values.stepUp && values.xrplPayout;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{resume ? "Finish private policy setup" : "Create a private XRP vault"}</CardTitle>
        <CardDescription>
          {resume
            ? "The vault exists, but no policy is active yet. Enroll a passkey and commit the encrypted policy to finish setup."
            : "The limits and recipient list are encrypted for FCC. Only a commitment is public. Your XRPL recovery address remains visible so the exit can be enforced on-chain."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="vaultName">Vault name</FieldLabel>
            <Input id="vaultName" value={values.name} onChange={(event) => update("name", event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField id="perTx" label="Per payment" value={values.perTx} onChange={(value) => update("perTx", value)} />
            <MoneyField id="daily" label="Per day" value={values.daily} onChange={(value) => update("daily", value)} />
            <MoneyField id="stepUp" label="Passkey above" value={values.stepUp} onChange={(value) => update("stepUp", value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="payee">First approved recipient</FieldLabel>
              <Input
                id="payee"
                value={values.payee}
                onChange={(event) => update("payee", event.target.value)}
                placeholder="0x… (optional)"
                className="font-mono text-xs"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="payeeLabel">Recipient label</FieldLabel>
              <Input id="payeeLabel" value={values.payeeLabel} onChange={(event) => update("payeeLabel", event.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="guardian">Guardian</FieldLabel>
            <Input
              id="guardian"
              value={values.guardian}
              onChange={(event) => update("guardian", event.target.value)}
              placeholder="0x… (recommended)"
              className="font-mono text-xs"
            />
            <FieldDescription>A guardian can lock the vault or cancel a compromised recovery.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="xrplPayout">XRPL recovery address</FieldLabel>
            <Input
              id="xrplPayout"
              value={values.xrplPayout}
              onChange={(event) => update("xrplPayout", event.target.value)}
              placeholder="r…"
              className="font-mono text-xs"
            />
            <FieldDescription>Emergency recovery and normal redemption can only settle here.</FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-col items-start gap-2">
          <Button onClick={() => onOpen(values)} disabled={busy || !complete}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {resume ? "Enroll passkey and finish" : "Create vault and passkey"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {resume
              ? "One wallet transaction remains: commit the encrypted policy."
              : "Two wallet transactions: deploy the isolated vault, then commit its encrypted policy."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PayForm({
  busy,
  disabled,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onSubmit: (to: string, amount: string) => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="paymentRecipient">Recipient</FieldLabel>
          <Input
            id="paymentRecipient"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="0x…"
            className="font-mono text-xs"
          />
          <FieldDescription>FCC checks this against the encrypted recipient list.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="paymentAmount">Amount</FieldLabel>
          <Input
            id="paymentAmount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.0"
          />
          <FieldDescription>FXRP</FieldDescription>
        </Field>
      </FieldGroup>
      <div>
        <Button onClick={() => onSubmit(to, amount)} disabled={disabled || !to || !amount}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Request private authorization
        </Button>
      </div>
    </div>
  );
}

export function AmountForm({
  id,
  label,
  action,
  busy,
  disabled,
  hint,
  onSubmit,
}: {
  id: string;
  label: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  hint?: string;
  onSubmit: (amount: string) => void;
}) {
  const [amount, setAmount] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input id={id} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" />
        <FieldDescription>{hint ?? "FXRP"}</FieldDescription>
      </Field>
      <div>
        <Button onClick={() => onSubmit(amount)} disabled={disabled || !amount}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {action}
        </Button>
      </div>
    </div>
  );
}

export function OutcomePanel({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "refused") {
    const steps: EvidenceStep[] = [
      ...(outcome.instructionHash
        ? [{
            label: "FCC instruction",
            detail: "Open the confirmed instruction transaction",
            state: "complete" as const,
            href: explorerTx(outcome.instructionHash),
          }]
        : []),
      { label: "Private policy decision", detail: outcome.detail, state: "refused" },
      { label: "Vault execution", detail: "No execution transaction was submitted", state: "not-sent" },
    ];
    return (
      <Alert>
        <ShieldXIcon />
        <AlertTitle>{outcome.rule}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{outcome.detail}</span>
          <EvidenceTimeline steps={steps} />
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "error") {
    const steps: EvidenceStep[] = outcome.instructionHash
      ? [
          {
            label: "FCC instruction",
            detail: "Open the confirmed instruction transaction",
            state: "complete",
            href: explorerTx(outcome.instructionHash),
          },
          { label: "Confidential policy decision", detail: outcome.detail, state: "failed" },
          { label: "Vault execution", detail: "No execution transaction was submitted", state: "not-sent" },
        ]
      : [];
    return (
      <Alert variant="destructive">
        <ShieldXIcon />
        <AlertTitle>Request incomplete</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{outcome.detail}</span>
          {steps.length > 0 ? <EvidenceTimeline steps={steps} /> : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.kind === "ready") {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Authorization ready</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{outcome.message}</span>
          <EvidenceTimeline
            steps={[
              ...(outcome.instructionHash
                ? [{
                label: "FCC instruction",
                detail: "Open the confirmed instruction transaction",
                state: "complete" as const,
                href: explorerTx(outcome.instructionHash),
              }]
                : []),
              ...(outcome.authorization
                ? [{
                label: "Private policy decision",
                detail: `Authorization ${outcome.authorization.digest.slice(0, 10)}… bound to nonce ${outcome.authorization.nonce}`,
                state: "complete" as const,
              }]
                : []),
              ...(outcome.hash
                ? [{
                    label: "On-chain approval",
                    detail: "Open the confirmed approval transaction",
                    state: "complete" as const,
                    href: explorerTx(outcome.hash),
                  }]
                : []),
              {
                label: "Vault execution",
                detail: "Waiting for your separate Execute click and wallet confirmation",
                state: "pending",
              },
            ]}
          />
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CheckCircle2Icon />
      <AlertTitle>Complete</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{outcome.message}</span>
        <EvidenceTimeline steps={completeSteps(outcome)} />
      </AlertDescription>
    </Alert>
  );
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
      <FieldDescription>USD</FieldDescription>
    </Field>
  );
}

function completeSteps(outcome: Extract<Outcome, { kind: "done" }>): EvidenceStep[] {
  const steps: EvidenceStep[] = [];
  if (outcome.instructionHash) {
    steps.push({
      label: "FCC instruction",
      detail: "Open the confirmed instruction transaction",
      state: "complete",
      href: explorerTx(outcome.instructionHash),
    });
  }
  if (outcome.authorization) {
    steps.push({
      label: "Private policy decision",
      detail: `Authorization ${outcome.authorization.digest.slice(0, 10)}… bound to nonce ${outcome.authorization.nonce}`,
      state: "complete",
    });
  }
  if (outcome.hash) {
    steps.push({
      label: outcome.authorization ? "Vault execution" : "On-chain transaction",
      detail: "Open the confirmed Coston2 transaction",
      state: "complete",
      href: explorerTx(outcome.hash),
    });
  }
  if (steps.length === 0) {
    steps.push({ label: "Request prepared", detail: outcome.message, state: "complete" });
  }
  return steps;
}
