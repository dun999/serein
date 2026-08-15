import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = new URL("../deployments/coston2.json", import.meta.url);
const current = JSON.parse(readFileSync(manifestPath, "utf8"));

const requiredAddress = (name) => {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return value;
};
const requiredBytes32 = (name) => {
  const value = process.env[name]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be bytes32`);
  return value;
};
const requiredUrl = (name) => {
  const value = process.env[name]?.trim();
  if (!value || new URL(value).protocol !== "https:") throw new Error(`${name} must be an HTTPS URL`);
  return value.replace(/\/$/, "");
};

const vaultFactory = requiredAddress("NEXT_PUBLIC_VAULT_FACTORY_ADDRESS");

// A factory swap must keep the outgoing address discoverable, because vaults
// already created by it are only listed through their own factory. Dropping
// the list here would hide every existing vault from the app without error.
const legacyVaultFactories = [...(current.contracts.legacyVaultFactories ?? []), current.contracts.vaultFactory]
  .filter((value, index, all) =>
    value.toLowerCase() !== vaultFactory.toLowerCase()
    && all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);

const next = {
  ...current,
  contracts: {
    vaultFactory,
    legacyVaultFactories,
    instructionSender: requiredAddress("NEXT_PUBLIC_INSTRUCTION_SENDER_ADDRESS"),
    fxrp: requiredAddress("NEXT_PUBLIC_FXRP_ADDRESS"),
    assetManager: requiredAddress("NEXT_PUBLIC_ASSET_MANAGER_ADDRESS"),
    ftsoV2: requiredAddress("NEXT_PUBLIC_FTSO_V2_ADDRESS"),
    teeMachineRegistry: requiredAddress("NEXT_PUBLIC_TEE_MACHINE_REGISTRY_ADDRESS"),
  },
  fcc: {
    extensionId: requiredBytes32("NEXT_PUBLIC_FCC_EXTENSION_ID"),
    teeMachine: requiredAddress("NEXT_PUBLIC_FCC_TEE_ADDRESS"),
    proxyUrl: requiredUrl("NEXT_PUBLIC_FCC_PROXY_URL"),
    imageDigest: process.env.FCC_IMAGE_DIGEST?.trim() || current.fcc.imageDigest,
  },
  evidence: {
    deployedAt: process.env.DEPLOYED_AT?.trim() || new Date().toISOString(),
    webUrl: requiredUrl("PUBLIC_WEB_URL"),
    demoVideoUrl: process.env.DEMO_VIDEO_URL?.trim() || null,
  },
};

if (!/^sha256:[0-9a-f]{64}$/.test(next.fcc.imageDigest ?? "")) {
  throw new Error("FCC_IMAGE_DIGEST must be a sha256 digest");
}
if (next.evidence.demoVideoUrl && new URL(next.evidence.demoVideoUrl).protocol !== "https:") {
  throw new Error("DEMO_VIDEO_URL must be an HTTPS URL");
}

writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);

console.log("Updated deployments/coston2.json from validated public release values.");
