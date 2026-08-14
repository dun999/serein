"use client";

import {
  createFlareNetwork,
  FccClient,
  PrivateVaultClient,
  readXrpUsdPrice,
  resolveFlareContracts,
  type FlareContracts,
  type XrpUsdPrice,
} from "@covenant/sdk";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
} from "viem";

import {
  COSTON2,
  ASSET_MANAGER_ADDRESS,
  FCC_PROXY_URL,
  FCC_TEE_ADDRESS,
  FTSO_V2_ADDRESS,
  FXRP_ADDRESS,
  INSTRUCTION_SENDER_ADDRESS,
  PRIVATE_VAULT_CONFIGURED,
  VAULT_FACTORY_ADDRESS,
  coston2Chain,
} from "@/lib/chain";

interface CovenantContext {
  address: Address | null;
  chainOk: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  vaultClient: PrivateVaultClient | null;
  teeAddress: Address;
  deploymentReady: boolean;
  error: string | null;
  xrpUsd: XrpUsdPrice | null;
}

const Ctx = createContext<CovenantContext | null>(null);
const DISCONNECTED = "covenant:disconnected";

function injected(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
}

export function CovenantProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicClient = useMemo(
    () => createPublicClient({ chain: coston2Chain, transport: http(COSTON2.rpcUrl) }),
    [],
  );

  // The official Flare SDK network is the trust anchor for Flare-owned
  // addresses. It is bound to the deployment RPC so the registry, FTSO feed,
  // and health checks observe the same network as the manifest.
  const flareNetwork = useMemo(() => createFlareNetwork(COSTON2.rpcUrl), []);

  // Flare's own registry is the source of truth for Flare-owned addresses. The
  // manifest seeds the first render so nothing waits on an RPC round trip, and
  // it stays the fallback when the registry cannot be reached.
  const [flare, setFlare] = useState<FlareContracts>({
    ftsoV2: FTSO_V2_ADDRESS,
    assetManager: ASSET_MANAGER_ADDRESS,
    fxrp: FXRP_ADDRESS,
  });

  const [xrpUsd, setXrpUsd] = useState<XrpUsdPrice | null>(null);

  useEffect(() => {
    if (!PRIVATE_VAULT_CONFIGURED) return;
    let cancelled = false;
    const refresh = () =>
      void (async () => {
        try {
          const price = await readXrpUsdPrice(flareNetwork);
          if (!cancelled) setXrpUsd(price);
        } catch {
          // Feed unavailable; the UI falls back to "—".
        }
      })();
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [flareNetwork]);

  useEffect(() => {
    if (!PRIVATE_VAULT_CONFIGURED) return;
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveFlareContracts(flareNetwork);
        if (!cancelled) setFlare(resolved);
      } catch {
        // Keep the manifest addresses; the deployment health check reports drift.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flareNetwork]);

  const vaultClient = useMemo(() => {
    const provider = injected();
    if (!provider || !address || !PRIVATE_VAULT_CONFIGURED) return null;
    const walletClient = createWalletClient({
      account: address,
      chain: coston2Chain,
      transport: custom(provider),
    });
    const fcc = new FccClient({
      instructionSender: INSTRUCTION_SENDER_ADDRESS,
      proxyUrl: FCC_PROXY_URL,
      publicClient: publicClient as never,
      walletClient: walletClient as never,
    });
    return new PrivateVaultClient({
      factory: VAULT_FACTORY_ADDRESS,
      fxrp: flare.fxrp,
      assetManager: flare.assetManager,
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      fcc,
    });
  }, [address, publicClient, flare]);

  const connect = useCallback(async () => {
    const provider = injected();
    if (!provider) {
      setError("No Ethereum wallet found. Install MetaMask or another EVM wallet.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      sessionStorage.removeItem(DISCONNECTED);
      setAddress(accounts[0] ?? null);
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      if (Number.parseInt(chainId, 16) !== COSTON2.chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${COSTON2.chainId.toString(16)}` }],
          });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${COSTON2.chainId.toString(16)}`,
                chainName: COSTON2.name,
                nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
                rpcUrls: [COSTON2.rpcUrl],
                blockExplorerUrls: [COSTON2.explorer],
              },
            ],
          });
        }
      }
      setChainOk(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect the wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(null);
    setChainOk(false);
    setError(null);
    sessionStorage.setItem(DISCONNECTED, "1");
    try {
      await injected()?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Older wallets do not implement permission revocation.
    }
  }, []);

  useEffect(() => {
    const provider = injected();
    if (!provider) return;
    let cancelled = false;
    void (async () => {
      if (sessionStorage.getItem(DISCONNECTED) === "1") return;
      const accounts = (await provider.request({ method: "eth_accounts" })) as Address[];
      if (cancelled || accounts.length === 0) return;
      setAddress(accounts[0]);
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      setChainOk(Number.parseInt(chainId, 16) === COSTON2.chainId);
    })();

    const onAccounts = (value: unknown) => setAddress((value as Address[])[0] ?? null);
    const onChain = (value: unknown) =>
      setChainOk(Number.parseInt(value as string, 16) === COSTON2.chainId);
    const events = provider as unknown as {
      on?: (event: string, callback: (value: unknown) => void) => void;
      removeListener?: (event: string, callback: (value: unknown) => void) => void;
    };
    events.on?.("accountsChanged", onAccounts);
    events.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      events.removeListener?.("accountsChanged", onAccounts);
      events.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const value = {
    address,
    chainOk,
    connecting,
    connect,
    disconnect,
    vaultClient,
    teeAddress: FCC_TEE_ADDRESS,
    deploymentReady: PRIVATE_VAULT_CONFIGURED,
    error,
    xrpUsd,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCovenant(): CovenantContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCovenant must be used inside CovenantProvider");
  return ctx;
}
