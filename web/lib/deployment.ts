import manifest from "../../deployments/coston2.json";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface PublicDeployment {
  network: "coston2";
  chainId: 114;
  rpcUrl: string;
  explorerUrl: string;
  contracts: {
    vaultFactory: `0x${string}`;
    instructionSender: `0x${string}`;
    fxrp: `0x${string}`;
    assetManager: `0x${string}`;
    ftsoV2: `0x${string}`;
    teeMachineRegistry: `0x${string}`;
  };
  fcc: {
    extensionId: `0x${string}` | null;
    teeMachine: `0x${string}`;
    proxyUrl: string;
    imageDigest: string | null;
  };
  evidence: {
    deployedAt: string | null;
    webUrl: string | null;
    demoVideoUrl: string | null;
  };
}

export interface PublicDeploymentOverrides {
  vaultFactory?: string;
  instructionSender?: string;
  fxrp?: string;
  assetManager?: string;
  ftsoV2?: string;
  teeMachineRegistry?: string;
  extensionId?: string;
  teeMachine?: string;
  proxyUrl?: string;
}

export interface BuildPublicDeploymentOptions {
  /** Disable the checked-in release manifest when testing fail-closed behavior. */
  useManifest?: boolean;
}

export function buildPublicDeployment(
  overrides: PublicDeploymentOverrides = {},
  options: BuildPublicDeploymentOptions = {},
): PublicDeployment {
  const release = options.useManifest === false ? null : manifest;
  return {
    network: "coston2",
    chainId: 114,
    rpcUrl: manifest.rpcUrl,
    explorerUrl: manifest.explorerUrl,
    contracts: {
      vaultFactory: address(overrides.vaultFactory, release?.contracts.vaultFactory ?? null),
      instructionSender: address(overrides.instructionSender, release?.contracts.instructionSender ?? null),
      fxrp: address(overrides.fxrp, release?.contracts.fxrp ?? null),
      assetManager: address(overrides.assetManager, release?.contracts.assetManager ?? null),
      ftsoV2: address(overrides.ftsoV2, release?.contracts.ftsoV2 ?? null),
      teeMachineRegistry: address(overrides.teeMachineRegistry, release?.contracts.teeMachineRegistry ?? null),
    },
    fcc: {
      extensionId: bytes32(overrides.extensionId, release?.fcc.extensionId ?? null),
      teeMachine: address(overrides.teeMachine, release?.fcc.teeMachine ?? null),
      proxyUrl: url(overrides.proxyUrl, release?.fcc.proxyUrl ?? null) ?? "",
      imageDigest: manifest.fcc.imageDigest,
    },
    evidence: manifest.evidence,
  };
}

export function isDeploymentConfigured(deployment: PublicDeployment): boolean {
  return [
    deployment.contracts.vaultFactory,
    deployment.contracts.instructionSender,
    deployment.contracts.fxrp,
    deployment.contracts.assetManager,
    deployment.contracts.ftsoV2,
    deployment.contracts.teeMachineRegistry,
    deployment.fcc.teeMachine,
  ].every((value) => value !== ZERO_ADDRESS) && Boolean(deployment.fcc.extensionId && deployment.fcc.proxyUrl);
}

function address(primary: string | undefined, fallback: string | null): `0x${string}` {
  const value = primary?.trim() || fallback || "";
  return /^0x[0-9a-fA-F]{40}$/.test(value) && value !== ZERO_ADDRESS
    ? (value as `0x${string}`)
    : ZERO_ADDRESS;
}

function bytes32(primary: string | undefined, fallback: string | null): `0x${string}` | null {
  const value = primary?.trim() || fallback || "";
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as `0x${string}`) : null;
}

function url(primary: string | undefined, fallback: string | null): string | null {
  const value = primary?.trim() || fallback;
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
      ? parsed.toString().replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

export const PUBLIC_DEPLOYMENT = buildPublicDeployment({
  vaultFactory: process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS,
  instructionSender: process.env.NEXT_PUBLIC_INSTRUCTION_SENDER_ADDRESS,
  fxrp: process.env.NEXT_PUBLIC_FXRP_ADDRESS,
  assetManager: process.env.NEXT_PUBLIC_ASSET_MANAGER_ADDRESS,
  ftsoV2: process.env.NEXT_PUBLIC_FTSO_V2_ADDRESS,
  teeMachineRegistry: process.env.NEXT_PUBLIC_TEE_MACHINE_REGISTRY_ADDRESS,
  extensionId: process.env.NEXT_PUBLIC_FCC_EXTENSION_ID,
  teeMachine: process.env.NEXT_PUBLIC_FCC_TEE_ADDRESS,
  proxyUrl: process.env.NEXT_PUBLIC_FCC_PROXY_URL,
});
