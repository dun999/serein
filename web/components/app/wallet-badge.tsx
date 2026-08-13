"use client";

import { LogOutIcon, WalletIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { shorten } from "@/lib/chain";
import { useCovenant } from "@/lib/covenant-provider";

/** Who the app is acting as. There is no other identity in this product. */
export function WalletBadge() {
  const { address, connect, connecting, disconnect } = useCovenant();

  if (!address) {
    return (
      <Button size="sm" variant="outline" onClick={connect} disabled={connecting}>
        <WalletIcon data-icon="inline-start" />
        Connect
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
      <WalletIcon className="size-3 shrink-0" />
      <span className="font-mono">{shorten(address, 5, 4)}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-muted-foreground"
        onClick={() => void disconnect()}
        title="Disconnect"
      >
        <LogOutIcon className="size-3" />
        <span className="sr-only">Disconnect</span>
      </Button>
    </span>
  );
}
