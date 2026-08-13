"use client";

import { useCallback, useEffect, useState } from "react";

import type { DeploymentHealth } from "@/lib/deployment-health";

export function useDeploymentHealth(intervalMs = 30_000) {
  const [health, setHealth] = useState<DeploymentHealth | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const next = (await response.json()) as DeploymentHealth;
      setHealth(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [intervalMs, refresh]);

  return { health, error, refresh };
}
