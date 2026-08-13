/** Flare Coston2 deployment coordinates from the public release manifest. */
import { PUBLIC_DEPLOYMENT, isDeploymentConfigured } from "@/lib/deployment";

export const VAULT_FACTORY_ADDRESS = PUBLIC_DEPLOYMENT.contracts.vaultFactory;
export const INSTRUCTION_SENDER_ADDRESS = PUBLIC_DEPLOYMENT.contracts.instructionSender;
export const FCC_TEE_ADDRESS = PUBLIC_DEPLOYMENT.fcc.teeMachine;
export const FCC_PROXY_URL = PUBLIC_DEPLOYMENT.fcc.proxyUrl;
export const FXRP_ADDRESS = PUBLIC_DEPLOYMENT.contracts.fxrp;
export const ASSET_MANAGER_ADDRESS = PUBLIC_DEPLOYMENT.contracts.assetManager;
export const FTSO_V2_ADDRESS = PUBLIC_DEPLOYMENT.contracts.ftsoV2;
export const TEE_MACHINE_REGISTRY_ADDRESS = PUBLIC_DEPLOYMENT.contracts.teeMachineRegistry;
export const FCC_EXTENSION_ID = PUBLIC_DEPLOYMENT.fcc.extensionId;

export const PRIVATE_VAULT_CONFIGURED = isDeploymentConfigured(PUBLIC_DEPLOYMENT);

export const COSTON2 = {
  chainId: PUBLIC_DEPLOYMENT.chainId,
  name: "Flare Coston2",
  rpcUrl: PUBLIC_DEPLOYMENT.rpcUrl,
  explorer: PUBLIC_DEPLOYMENT.explorerUrl,
} as const;

export const coston2Chain = {
  id: COSTON2.chainId,
  name: COSTON2.name,
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2.rpcUrl] } },
  blockExplorers: { default: { name: "Explorer", url: COSTON2.explorer } },
} as const;

export const explorerTx = (hash: string) => `${COSTON2.explorer}/tx/${hash}`;
export const explorerAddress = (address: string) => `${COSTON2.explorer}/address/${address}`;

/** Shorten an address or hash for display without losing its identity. */
export function shorten(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
