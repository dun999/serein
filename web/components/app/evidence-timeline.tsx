import { CircleCheckIcon, CircleSlashIcon, Clock3Icon, ExternalLinkIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export interface EvidenceStep {
  label: string;
  detail: string;
  state: "complete" | "refused" | "failed" | "pending" | "not-sent";
  href?: string;
}

export function EvidenceTimeline({ steps }: { steps: readonly EvidenceStep[] }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Action evidence">
      {steps.map((step) => {
        const Icon = step.state === "complete"
          ? CircleCheckIcon
          : step.state === "pending"
            ? Clock3Icon
            : CircleSlashIcon;
        return (
          <li key={`${step.label}:${step.state}`} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{step.label}</span>
                <Badge variant="outline">{labelFor(step.state)}</Badge>
              </div>
              {step.href ? (
                <a
                  className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2"
                  href={step.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {step.detail}
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">{step.detail}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function labelFor(state: EvidenceStep["state"]): string {
  switch (state) {
    case "complete": return "Confirmed";
    case "refused": return "Refused";
    case "failed": return "Failed";
    case "pending": return "Pending";
    case "not-sent": return "Not sent";
  }
}
