/** Regenerate the private-vault ABIs from compiled production contracts. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
