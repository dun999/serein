import type { PublicDeployment } from "@/lib/deployment";
import { isDeploymentConfigured, ZERO_ADDRESS } from "@/lib/deployment";
import {
  decodeFunctionResult,
  encodeFunctionData,
} from "viem";

const teeRegistryAbi = [
  {
    type: "function",
    name: "getTeeMachineStatus",
    stateMutability: "view",
    inputs: [{ name: "tee", type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "getExtensionId",
    stateMutability: "view",
    inputs: [{ name: "tee", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getTeeMachine",
    stateMutability: "view",
    inputs: [{ name: "tee", type: "address" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "teeId", type: "address" },
        { name: "teeProxyId", type: "address" },
        { name: "url", type: "string" },
      ],
    }],
  },
  {
    type: "function",
    name: "getActiveTeeMachines",
    stateMutability: "view",
    inputs: [{ name: "extensionId", type: "uint256" }],
    outputs: [
      { name: "teeIds", type: "address[]" },
      { name: "urls", type: "string[]" },
    ],
  },
  {
    type: "function",
    name: "getLastStatusChangeTs",
    stateMutability: "view",
    inputs: [{ name: "tee", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const availabilityValiditySeconds = 6 * 60 * 60;

export type HealthState = "ready" | "degraded" | "unconfigured";
export type CheckState = "pass" | "fail" | "skip";

export interface DeploymentCheck {
  state: CheckState;
  detail: string;
}

export interface DeploymentHealth {
  status: HealthState;
  checkedAt: string;
  network: {
    name: "Flare Coston2";
    chainId: 114;
    explorerUrl: string;
  };
  deployment: {
    configured: boolean;
    contracts: PublicDeployment["contracts"];
    fcc: PublicDeployment["fcc"];
  };
  checks: {
    chain: DeploymentCheck;
    vaultFactory: DeploymentCheck;
    instructionSender: DeploymentCheck;
    fxrp: DeploymentCheck;
    assetManager: DeploymentCheck;
    ftsoV2: DeploymentCheck;
    teeMachineRegistry: DeploymentCheck;
    teeMachine: DeploymentCheck;
    fccAvailability: DeploymentCheck;
    fccProxy: DeploymentCheck;
  };
}

interface HealthOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

export async function checkDeploymentHealth(
  deployment: PublicDeployment,
  options: HealthOptions = {},
): Promise<DeploymentHealth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 4_000;
  const checkedAt = options.now?.() ?? new Date();
  const configured = isDeploymentConfigured(deployment);

  if (!configured) {
    return {
      status: "unconfigured",
      checkedAt: checkedAt.toISOString(),
      network: network(deployment),
      deployment: publicDeployment(deployment, false),
      checks: skippedChecks(),
    };
  }

  const chainPromise = rpc<string>(deployment.rpcUrl, "eth_chainId", [], fetchImpl, timeoutMs)
    .then((value) => {
      const actual = Number.parseInt(value, 16);
      return actual === deployment.chainId
        ? pass(`Connected to chain ${actual}`)
        : fail(`RPC returned chain ${actual}; expected ${deployment.chainId}`);
    })
    .catch(() => fail("Coston2 RPC is unreachable"));

  const codeCheck = (address: `0x${string}`, label: string) =>
    rpc<string>(deployment.rpcUrl, "eth_getCode", [address, "latest"], fetchImpl, timeoutMs)
      .then((code) => code && code !== "0x" && code !== "0x0"
        ? pass(`${label} bytecode is present`)
        : fail(`${label} has no deployed bytecode`))
      .catch(() => fail(`${label} bytecode could not be verified`));

  const proxyPromise = fetchWithTimeout(
    `${deployment.fcc.proxyUrl.replace(/\/$/, "")}/info`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
    fetchImpl,
    timeoutMs,
  )
    .then(async (response) => {
      if (!response.ok) return fail(`FCC proxy returned HTTP ${response.status}`);
      const body = await response.json().catch(() => null) as {
        machineData?: { extensionId?: string };
      } | null;
      const proxyExtensionId = body?.machineData?.extensionId;
      if (!proxyExtensionId || !/^0x[0-9a-fA-F]{64}$/.test(proxyExtensionId)) {
        return fail("FCC proxy returned invalid machine information");
      }
      return BigInt(proxyExtensionId) === BigInt(deployment.fcc.extensionId!)
        ? pass("FCC proxy reports the Serein extension")
        : fail("FCC proxy reports a different extension ID");
    })
    .catch(() => fail("FCC proxy is unreachable"));

  const teePromise = Promise.all([
    contractRead(
      deployment,
      "getTeeMachineStatus",
      [deployment.fcc.teeMachine],
      fetchImpl,
      timeoutMs,
    ),
    contractRead(
      deployment,
      "getExtensionId",
      [deployment.fcc.teeMachine],
      fetchImpl,
      timeoutMs,
    ),
    contractRead(
      deployment,
      "getTeeMachine",
      [deployment.fcc.teeMachine],
      fetchImpl,
      timeoutMs,
    ),
    contractRead(
      deployment,
      "getActiveTeeMachines",
      [BigInt(deployment.fcc.extensionId!)],
      fetchImpl,
      timeoutMs,
    ),
  ])
    .then(([status, extensionId, machineValue, activeValue]) => {
      if (Number(status) !== 2) return fail(`FCC machine status is ${status}; Production is 2`);
      if (extensionId !== BigInt(deployment.fcc.extensionId!)) {
        return fail("FCC machine belongs to a different extension ID");
      }
      const machine = machineValue as { teeId: string; teeProxyId: string; url: string };
      if (machine.teeId.toLowerCase() !== deployment.fcc.teeMachine.toLowerCase()) {
        return fail("FCC teeId is not registered under the configured identity");
      }
      if (machine.teeProxyId.toLowerCase() === ZERO_ADDRESS) {
        return fail("FCC machine has no registered proxy identity");
      }
      if (normalizeUrl(machine.url) !== normalizeUrl(deployment.fcc.proxyUrl)) {
        return fail("FCC machine URL differs from the configured stable proxy URL");
      }
      const [activeTeeIds, activeUrls] = activeValue as readonly [readonly string[], readonly string[]];
      if (activeTeeIds.length !== 1 || activeUrls.length !== 1) {
        return fail(`Serein has ${activeTeeIds.length} active FCC machines; expected exactly one`);
      }
      if (
        activeTeeIds[0]?.toLowerCase() !== deployment.fcc.teeMachine.toLowerCase()
        || normalizeUrl(activeUrls[0] ?? "") !== normalizeUrl(deployment.fcc.proxyUrl)
      ) {
        return fail("The active FCC machine does not match the configured identity and URL");
      }
      return pass("FCC machine is Production, registered, and the sole active Serein machine");
    })
    .catch(() => fail("FCC machine registry state could not be verified"));

  const availabilityPromise = checkAvailability(
    deployment,
    fetchImpl,
    timeoutMs,
    checkedAt,
  ).catch(() => fail("FCC availability validity could not be verified"));

  const [
    chain,
    vaultFactory,
    instructionSender,
    fxrp,
    assetManager,
    ftsoV2,
    teeMachineRegistry,
    teeMachine,
    fccAvailability,
    fccProxy,
  ] = await Promise.all([
    chainPromise,
    codeCheck(deployment.contracts.vaultFactory, "Vault factory"),
    codeCheck(deployment.contracts.instructionSender, "Instruction sender"),
    codeCheck(deployment.contracts.fxrp, "FXRP"),
    codeCheck(deployment.contracts.assetManager, "AssetManager"),
    codeCheck(deployment.contracts.ftsoV2, "FTSOv2"),
    codeCheck(deployment.contracts.teeMachineRegistry, "TEE machine registry"),
    teePromise,
    availabilityPromise,
    proxyPromise,
  ]);
  const checks = {
    chain,
    vaultFactory,
    instructionSender,
    fxrp,
    assetManager,
    ftsoV2,
    teeMachineRegistry,
    teeMachine,
    fccAvailability,
    fccProxy,
  };
  const ready = Object.values(checks).every((check) => check.state === "pass");

  return {
    status: ready ? "ready" : "degraded",
    checkedAt: checkedAt.toISOString(),
    network: network(deployment),
    deployment: publicDeployment(deployment, true),
    checks,
  };
}

function network(deployment: PublicDeployment): DeploymentHealth["network"] {
  return { name: "Flare Coston2", chainId: deployment.chainId, explorerUrl: deployment.explorerUrl };
}

function publicDeployment(
  deployment: PublicDeployment,
  configured: boolean,
): DeploymentHealth["deployment"] {
  return {
    configured,
    contracts: deployment.contracts,
    fcc: deployment.fcc,
  };
}

function skippedChecks(): DeploymentHealth["checks"] {
  const skipped = skip("Address is not configured in the public deployment manifest");
  return {
    chain: skip("Deployment is not configured"),
    vaultFactory: skipped,
    instructionSender: skipped,
    fxrp: skipped,
    assetManager: skipped,
    ftsoV2: skipped,
    teeMachineRegistry: skipped,
    teeMachine: skipped,
    fccAvailability: skip("FCC machine is not configured"),
    fccProxy: skip("FCC proxy is not configured"),
  };
}

function pass(detail: string): DeploymentCheck {
  return { state: "pass", detail };
}

function fail(detail: string): DeploymentCheck {
  return { state: "fail", detail };
}

function skip(detail: string): DeploymentCheck {
  return { state: "skip", detail };
}

async function rpc<T>(
  url: string,
  method: string,
  params: readonly unknown[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    },
    fetchImpl,
    timeoutMs,
  );
  if (!response.ok) throw new Error("RPC request failed");
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (body.error || body.result === undefined) throw new Error("RPC returned an error");
  return body.result;
}

async function contractRead(
  deployment: PublicDeployment,
  functionName: "getTeeMachineStatus" | "getExtensionId" | "getTeeMachine" | "getActiveTeeMachines" | "getLastStatusChangeTs",
  args: readonly [`0x${string}`] | readonly [bigint],
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<unknown> {
  const data = encodeFunctionData({ abi: teeRegistryAbi, functionName, args } as never);
  const result = await rpc<`0x${string}`>(
    deployment.rpcUrl,
    "eth_call",
    [{ to: deployment.contracts.teeMachineRegistry, data }, "latest"],
    fetchImpl,
    timeoutMs,
  );
  return decodeFunctionResult({ abi: teeRegistryAbi, functionName, data: result } as never);
}

async function checkAvailability(
  deployment: PublicDeployment,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  checkedAt: Date,
): Promise<DeploymentCheck> {
  // A machine can enter Production only through toProduction(proof), which
  // records the availability validity and changes its status in the same
  // transaction. Reading that transition timestamp avoids Coston2 RPC's
  // 30-block eth_getLogs limit while preserving the six-hour freshness check.
  const productionSince = await contractRead(
    deployment,
    "getLastStatusChangeTs",
    [deployment.fcc.teeMachine],
    fetchImpl,
    timeoutMs,
  ) as bigint;
  if (productionSince === 0n) return fail("No FCC Production transition was found");
  const validUntil = productionSince + BigInt(availabilityValiditySeconds);
  const remainingSeconds = Number(validUntil - BigInt(Math.floor(checkedAt.getTime() / 1_000)));
  if (remainingSeconds <= 0) return fail("FCC availability check has expired");
  return pass(`FCC availability is valid for ${formatDuration(remainingSeconds)}`);
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function configuredAddressCount(deployment: PublicDeployment): number {
  return [
    ...Object.values(deployment.contracts),
    deployment.fcc.teeMachine,
  ].filter((value) => value !== ZERO_ADDRESS).length;
}
