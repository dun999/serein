"use client";

import {
  type FccAdminAuthorization,
  type FccAuthorization,
  type PasskeyPolicy,
  type PrivatePolicy,
  type PrivateVaultState,
} from "@covenant/sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Address, Hex } from "viem";

import { useCovenant } from "@/lib/covenant-provider";
import { LEGACY_VAULT_FACTORY_ADDRESSES } from "@/lib/chain";
import { explainOutcome } from "@/lib/outcome";

export type Outcome =
  | {
      kind: "done";
      message: string;
      hash?: Hex;
      instructionHash?: Hex;
      authorization?: FccAuthorization | FccAdminAuthorization;
    }
  | {
      kind: "ready";
      message: string;
      instructionHash?: Hex;
      authorization?: FccAuthorization | FccAdminAuthorization;
      hash?: Hex;
    }
  | { kind: "refused"; rule: string; detail: string; instructionHash?: Hex }
  | { kind: "error"; detail: string; instructionHash?: Hex };

export interface Snapshot {
  state: PrivateVaultState;
  walletFxrp: bigint;
  policy: PrivatePolicy | null;
  passkey: PasskeyPolicy | null;
}

interface TreasuryContext {
  vault: Address | null;
  vaults: readonly Address[];
  legacyVault: boolean;
  snap: Snapshot | null;
  busy: string | null;
  outcome: Outcome | null;
  run: (label: string, action: () => Promise<Outcome>) => Promise<void>;
  refresh: (vault: Address) => Promise<void>;
  adopt: (vault: Address) => Promise<void>;
  rememberPolicy: (vault: Address, policy: PrivatePolicy) => void;
  forgetPolicy: (vault: Address) => void;
  startNewVault: () => void;
}

const Ctx = createContext<TreasuryContext | null>(null);

export function TreasuryProvider({ children }: { children: React.ReactNode }) {
  const { address, vaultClient } = useCovenant();
  const [selection, setSelection] = useState<{ owner: Address; vault: Address } | null>(null);
  const [owned, setOwned] = useState<{
    owner: Address;
    vaults: readonly Address[];
    legacyVaults: readonly Address[];
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{ owner: Address; value: Snapshot } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const readVersion = useRef(0);

  const refresh = useCallback(
    async (vault: Address) => {
      if (!address || !vaultClient) return;
      const owner = address;
      const version = ++readVersion.current;
      const [state, walletFxrp] = await Promise.all([
        vaultClient.getState(vault),
        vaultClient.walletFxrpBalance(owner),
      ]);
      if (version !== readVersion.current) return;
      setSnapshot({
        owner,
        value: {
          state,
          walletFxrp,
          policy: readPolicy(vault),
          passkey: readPolicy(vault)?.webAuthn ?? null,
        },
      });
    },
    [address, vaultClient],
  );

  const adopt = useCallback(
    async (vault: Address) => {
      if (!address) return;
      setOwned((current) => {
        if (!current || current.owner !== address) {
          return { owner: address, vaults: [vault], legacyVaults: [] };
        }
        return current.vaults.some((item) => item.toLowerCase() === vault.toLowerCase())
          ? current
          : { ...current, vaults: [...current.vaults, vault] };
      });
      setSelection({ owner: address, vault });
      await refresh(vault);
    },
    [address, refresh],
  );

  useEffect(() => {
    if (!address || !vaultClient) return;
    let cancelled = false;
    const owner = address;
    void (async () => {
      const discovered = await Promise.all([
        vaultClient.vaultsOf(owner).catch(() => []),
        ...LEGACY_VAULT_FACTORY_ADDRESSES.map((factory) =>
          vaultClient.vaultsOf(owner, factory).catch(() => []),
        ),
      ]);
      const vaults = [...new Map(
        discovered.flat().map((vault) => [vault.toLowerCase(), vault]),
      ).values()];
      const legacyVaults = [...new Map(
        discovered.slice(1).flat().map((vault) => [vault.toLowerCase(), vault]),
      ).values()];
      const legacySet = new Set(legacyVaults.map((vault) => vault.toLowerCase()));
      if (cancelled) return;
      setOwned({ owner, vaults, legacyVaults });
      const states = await Promise.all(
        vaults.map((vault) => vaultClient.getState(vault).catch(() => null)),
      );
      if (cancelled) return;
      const latest = states
        .filter(
          (state) =>
            state &&
            state.status !== "destroyed" &&
            (!legacySet.has(state.address.toLowerCase()) ||
              state.balance > 0n ||
              readPolicy(state.address) !== null),
        )
        .sort((left, right) => Number((right?.balance ?? 0n) - (left?.balance ?? 0n)))
        .at(0)?.address;
      if (!latest) {
        setSelection(null);
        setSnapshot(null);
        return;
      }
      setSelection({ owner, vault: latest });
      await refresh(latest);
    })();
    return () => {
      cancelled = true;
      readVersion.current += 1;
    };
  }, [address, vaultClient, refresh]);

  const visibleVault = selection?.owner === address ? selection.vault : null;
  const visibleVaults = useMemo(
    () => (owned?.owner === address ? owned.vaults : []),
    [owned, address],
  );
  const visibleLegacyVault = useMemo(
    () =>
      Boolean(
        visibleVault &&
          owned?.owner === address &&
          owned.legacyVaults.some((vault) => vault.toLowerCase() === visibleVault.toLowerCase()),
      ),
    [address, owned, visibleVault],
  );
  const visibleSnap = snapshot?.owner === address && snapshot.value.state.address === visibleVault
    ? snapshot.value
    : null;

  const run = useCallback<TreasuryContext["run"]>(
    async (label, action) => {
      setBusy(label);
      setOutcome(null);
      try {
        setOutcome(await action());
      } catch (error) {
        setOutcome(explainOutcome(error));
      } finally {
        setBusy(null);
        if (visibleVault) await refresh(visibleVault).catch(() => undefined);
      }
    },
    [refresh, visibleVault],
  );

  const rememberPolicy = useCallback((vault: Address, policy: PrivatePolicy) => {
    localStorage.setItem(policyKey(vault), JSON.stringify(policy));
    setSnapshot((current) =>
      current && current.value.state.address === vault
        ? {
            ...current,
            value: { ...current.value, policy, passkey: policy.webAuthn ?? null },
          }
        : current,
    );
  }, []);

  const forgetPolicy = useCallback((vault: Address) => {
    localStorage.removeItem(policyKey(vault));
    localStorage.removeItem(`covenant:pending-private-policy:${vault.toLowerCase()}`);
    setSnapshot((current) =>
      current && current.value.state.address === vault
        ? {
            ...current,
            value: { ...current.value, policy: null, passkey: null },
          }
        : current,
    );
  }, []);

  const startNewVault = useCallback(() => {
    readVersion.current += 1;
    setSelection(null);
    setSnapshot(null);
    setOutcome(null);
  }, []);

  const value = useMemo(
    () => ({
      vault: visibleVault,
      vaults: visibleVaults,
      legacyVault: visibleLegacyVault,
      snap: visibleSnap,
      busy,
      outcome,
      run,
      refresh,
      adopt,
      rememberPolicy,
      forgetPolicy,
      startNewVault,
    }),
    [
      visibleVault,
      visibleVaults,
      visibleLegacyVault,
      visibleSnap,
      busy,
      outcome,
      run,
      refresh,
      adopt,
      rememberPolicy,
      forgetPolicy,
      startNewVault,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTreasury(): TreasuryContext {
  const context = useContext(Ctx);
  if (!context) throw new Error("useTreasury must be used inside TreasuryProvider");
  return context;
}

function policyKey(vault: Address): string {
  return `covenant:private-policy:${vault.toLowerCase()}`;
}

function readPolicy(vault: Address): PrivatePolicy | null {
  try {
    const value = localStorage.getItem(policyKey(vault));
    return value ? (JSON.parse(value) as PrivatePolicy) : null;
  } catch {
    return null;
  }
}
