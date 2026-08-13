import manifest from "../deployments/coston2.json" with { type: "json" };

const addresses = {
  vaultFactory: manifest.contracts.vaultFactory,
  instructionSender: manifest.contracts.instructionSender,
  fxrp: manifest.contracts.fxrp,
  assetManager: manifest.contracts.assetManager,
  ftsoV2: manifest.contracts.ftsoV2,
  teeMachineRegistry: manifest.contracts.teeMachineRegistry,
};
const missing = [...Object.entries(addresses), ["teeMachine", manifest.fcc.teeMachine]]
  .filter(([, value]) => !value || /^0x0{40}$/i.test(value));
if (missing.length || !manifest.fcc.extensionId || !manifest.fcc.proxyUrl) {
  throw new Error(`Public deployment manifest is incomplete: ${missing.map(([name]) => name).join(", ") || "FCC metadata"}`);
}

const chain = Number.parseInt(await rpc("eth_chainId", []), 16);
if (chain !== manifest.chainId) throw new Error(`RPC chain ${chain} does not match ${manifest.chainId}`);

for (const [name, address] of Object.entries(addresses)) {
  const code = await rpc("eth_getCode", [address, "latest"]);
  if (!code || code === "0x" || code === "0x0") throw new Error(`${name} has no deployed bytecode at ${address}`);
}

const teeArgument = manifest.fcc.teeMachine.slice(2).padStart(64, "0");
const status = BigInt(await rpc("eth_call", [{
  to: manifest.contracts.teeMachineRegistry,
  data: `0x25e30221${teeArgument}`,
}, "latest"]));
if (status !== 2n) throw new Error(`FCC machine is not Production (status ${status})`);
const extensionId = BigInt(await rpc("eth_call", [{
  to: manifest.contracts.teeMachineRegistry,
  data: `0xaa5bb892${teeArgument}`,
}, "latest"]));
if (extensionId !== BigInt(manifest.fcc.extensionId)) {
  throw new Error("FCC machine is registered under a different extension ID");
}

const proxy = await fetch(`${manifest.fcc.proxyUrl.replace(/\/$/, "")}/info`, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(10_000),
});
if (!proxy.ok) throw new Error(`FCC proxy returned HTTP ${proxy.status}`);
const info = await proxy.json();
if (!info || typeof info !== "object") throw new Error("FCC proxy returned invalid machine information");

console.log(`Public Coston2 deployment verified: ${Object.keys(addresses).length} bytecode checks, Production TEE binding, and FCC proxy health passed.`);

async function rpc(method, params) {
  const response = await fetch(manifest.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (!response.ok || body.error || body.result === undefined) throw new Error(`${method} failed`);
  return body.result;
}
