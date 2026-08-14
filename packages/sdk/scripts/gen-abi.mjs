/** Regenerate the private-vault ABIs from compiled production contracts. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const privateArtifacts = [
  ["vaultAbi", "../../../contracts/out/CovenantVault.sol/CovenantVault.json"],
  ["vaultFactoryAbi", "../../../contracts/out/CovenantVaultFactory.sol/CovenantVaultFactory.json"],
  ["instructionSenderAbi", "../../../extension/out/InstructionSender.sol/CovenantInstructionSender.json"],
];

const privateSource = privateArtifacts
  .map(([name, relative]) => {
    const parsed = JSON.parse(readFileSync(resolve(here, relative), "utf8"));
    return `export const ${name} = ${JSON.stringify(parsed.abi, null, 2)} as const;`;
  })
  .join("\n\n");

writeFileSync(
  resolve(here, "../src/private-abi.ts"),
  `/** Generated from CovenantVault, CovenantVaultFactory, and CovenantInstructionSender. */\n${privateSource}\n`,
);
console.log("private-abi.ts regenerated");

// Flare protocol contracts come from Flare's own published artifacts rather
// than hand-written fragments, so the interfaces this app calls stay in step
// with the network. The package is a devDependency: only these generated
// `as const` literals ship, never its ethers runtime.
const require = createRequire(import.meta.url);
// interfaceToAbi, not nameToAbi: the latter resolves only deployed contract
// names from the registry, while these are the published interfaces.
const { interfaceToAbi } = require("@flarenetwork/flare-periphery-contract-artifacts");
const flareNetwork = "coston2";

// Only the members this app calls are emitted. The definitions are still
// Flare's, copied verbatim — selecting them keeps a 220-entry interface from
// reaching the browser to support six calls.
const flareArtifacts = [
  ["assetManagerAbi", "IAssetManager", [
    "directMintingPaymentAddress",
    "getDirectMintingFeeBIPS",
    "getDirectMintingMinimumFeeUBA",
    "getDirectMintingExecutorFeeUBA",
    "minimumRedeemAmountUBA",
    "fAsset",
  ]],
  ["contractRegistryAbi", "IFlareContractRegistry", ["getContractAddressesByName"]],
  ["ftsoV2Abi", "FtsoV2Interface", [
    "getFeedById",
    "getFeedByIdInWei",
    "calculateFeeById",
  ]],
];

/** Picks named members out of a published ABI, erroring on anything missing. */
function selectMembers(abi, contract, members) {
  return members.map((member) => {
    const found = abi.filter((entry) => entry.name === member);
    if (found.length === 0) throw new Error(`${contract} has no member ${member} on ${flareNetwork}`);
    if (found.length > 1) throw new Error(`${contract}.${member} is overloaded; select it explicitly`);
    return found[0];
  });
}

const flareSource = flareArtifacts
  .map(([name, contract, members]) => {
    const abi = interfaceToAbi(contract, flareNetwork);
    if (!Array.isArray(abi) || abi.length === 0) {
      throw new Error(`Flare artifact ${contract} has no ABI on ${flareNetwork}`);
    }
    const selected = selectMembers(abi, contract, members);
    return `export const ${name} = ${JSON.stringify(selected, null, 2)} as const;`;
  })
  .join("\n\n");

// Flare publishes no TypeScript package for the Confidential Compute
// contracts, so the TEE registry ABI is extracted from the go-flare-common
// bindings the extension tooling builds against. Refresh with:
//   cd extension/tools && go run ./cmd/dump-tee-abi > ../../packages/sdk/abi/machinemanager.json
const machineManagerAbi = JSON.parse(readFileSync(resolve(here, "../abi/machinemanager.json"), "utf8"));
const machineManagerSource = `export const machineManagerAbi = ${JSON.stringify(
  selectMembers(machineManagerAbi, "MachineManager", [
    "getTeeMachineStatus",
    "getExtensionId",
    "getTeeMachine",
    "getActiveTeeMachines",
    "getLastStatusChangeTs",
    "getPublicKey",
  ]),
  null,
  2,
)} as const;`;

const flareVersion = JSON.parse(
  readFileSync(
    require.resolve("@flarenetwork/flare-periphery-contract-artifacts/package.json"),
    "utf8",
  ),
).version;

writeFileSync(
  resolve(here, "../src/flare-abi.ts"),
  `/** Generated from @flarenetwork/flare-periphery-contract-artifacts@${flareVersion} (${flareNetwork})\n`
  + ` *  and the MachineManager bindings in @flare-foundation/go-flare-common. */\n`
  + `${flareSource}\n\n${machineManagerSource}\n`,
);
console.log(`flare-abi.ts regenerated from flare-periphery-contract-artifacts@${flareVersion}`);
