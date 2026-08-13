import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("web/.env.local");
const backup = resolve(".covenant/legacy-web-env.backup");
if (!existsSync(source)) {
  console.log("web/.env.local is absent; no local migration was needed.");
  process.exit(0);
}

const original = readFileSync(source, "utf8");
const values = new Map();
for (const line of original.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
if (!existsSync(backup)) writeFileSync(backup, original, { mode: 0o600 });

const read = (name, fallback = "") => values.get(name) || fallback;
const rpc = read("COSTON2_RPC_URL", "https://coston2-api.flare.network/ext/C/rpc");
const fxrp = read("FXRP_ADDRESS");
const ftso = read("FTSO_V2_ADDRESS");
const assetManager = read("ASSET_MANAGER_FXRP_ADDRESS");
const teeRegistry = read("TEE_MACHINE_REGISTRY_ADDRESS");

const next = `# Covenant private-vault local configuration.
# The superseded public-policy values were moved to an ignored local backup.
COSTON2_RPC_URL=${rpc}
FXRP_ADDRESS=${fxrp}
FTSO_V2_ADDRESS=${ftso}
ASSET_MANAGER_FXRP_ADDRESS=${assetManager}
TEE_MACHINE_REGISTRY_ADDRESS=${teeRegistry}

NEXT_PUBLIC_FXRP_ADDRESS=${fxrp}
NEXT_PUBLIC_FTSO_V2_ADDRESS=${ftso}
NEXT_PUBLIC_ASSET_MANAGER_ADDRESS=${assetManager}
NEXT_PUBLIC_TEE_MACHINE_REGISTRY_ADDRESS=${teeRegistry}
NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=
NEXT_PUBLIC_INSTRUCTION_SENDER_ADDRESS=
NEXT_PUBLIC_FCC_EXTENSION_ID=
NEXT_PUBLIC_FCC_TEE_ADDRESS=
NEXT_PUBLIC_FCC_PROXY_URL=

# Add fresh server-only credentials for the release; do not reuse the legacy keys.
XAMAN_API_KEY=
XAMAN_API_SECRET=
`;

writeFileSync(source, next, { mode: 0o600 });
console.log("Migrated web/.env.local to the Covenant-only shape; legacy values are backed up under ignored .covenant/ state.");
