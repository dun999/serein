"use client";

import { CircleAlertIcon, CircleCheckIcon, ServerCogIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeploymentHealth } from "@/hooks/use-deployment-health";

export function DeploymentStatus({ compact = false }: { compact?: boolean }) {
  const { health, error } = useDeploymentHealth();

  if (!health && !error) {
    return <Skeleton className={compact ? "h-5 w-20" : "h-6 w-36"} />;
  }

  const state = error ? "degraded" : (health?.status ?? "degraded");
  const label = state === "ready"
    ? "Live on Coston2"
    : state === "unconfigured"
      ? "Awaiting deployment"
      : "Deployment degraded";
  const detail = error
    ? "The public health endpoint could not be reached."
    : state === "ready"
      ? "Coston2 contracts and the FCC proxy passed the latest live checks."
      : state === "unconfigured"
        ? "Public deployment addresses have not been published yet."
        : failedChecks(health!);
  const Icon = state === "ready" ? CircleCheckIcon : state === "unconfigured" ? ServerCogIcon : CircleAlertIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a href="/api/status" target="_blank" rel="noreferrer" aria-label={`${label}. Open deployment health.`} />
        }
      >
        <Badge variant={state === "ready" ? "secondary" : "outline"}>
          <Icon data-icon="inline-start" />
          {compact ? label.replace(" on Coston2", "") : label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function failedChecks(health: DeploymentHealthLike): string {
  const failed = Object.values(health.checks).filter((check) => check.state === "fail");
  return failed[0]?.detail ?? "One or more deployment checks failed.";
}

interface DeploymentHealthLike {
  checks: Record<string, { state: string; detail: string }>;
}
