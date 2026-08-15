import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, toFunctionSelector } from "viem";

import { buildPublicDeployment } from "@/lib/deployment";
import { checkDeploymentHealth } from "@/lib/deployment-health";

const address = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const deployment = buildPublicDeployment({
  vaultFactory: address("1"),
  instructionSender: address("2"),
  fxrp: address("3"),
  assetManager: address("4"),
  ftsoV2: address("5"),
  teeMachineRegistry: address("6"),
  teeMachine: address("7"),
  extensionId: `0x${"8".repeat(64)}`,
  proxyUrl: "https://fcc.example",
});
const now = new Date("2026-08-13T05:00:00.000Z");

describe("deployment health", () => {
  it("returns unconfigured without making network requests", async () => {
    const fetchImpl = vi.fn();
    const result = await checkDeploymentHealth(buildPublicDeployment({}, { useManifest: false }), { fetchImpl });
    expect(result.status).toBe("unconfigured");
    expect(result.checks.vaultFactory.state).toBe("skip");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports ready only when RPC bytecode and FCC all pass", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/info")) {
        return Response.json({ machineData: { extensionId: deployment.fcc.extensionId } });
      }
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      return Response.json({ jsonrpc: "2.0", id: 1, result: healthyRpcResult(request) });
    }) as unknown as typeof fetch;
    const result = await checkDeploymentHealth(deployment, { fetchImpl, now: () => now });
    expect(result.status).toBe("ready");
    expect(result.checks.teeMachine.detail).toContain("sole active");
    expect(result.checks.fccAvailability.state).toBe("pass");
    expect(result.checks.fccProxy.state).toBe("pass");
    expect(result.checks.flareRegistry.state).toBe("pass");
    expect(result.deployment.fcc).not.toHaveProperty("apiSecret");
  });

  it("reports degraded when the manifest drifts from the Flare registry", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/info")) {
        return Response.json({ machineData: { extensionId: deployment.fcc.extensionId } });
      }
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      const data = String(request.params?.[0]?.data);
      if (
        request.method === "eth_call"
        && data.startsWith(toFunctionSelector("getContractAddressesByName(string[])"))
      ) {
        // Flare redeployed AssetManagerFXRP; the manifest still names the old one.
        return Response.json({
          result: encodeAbiParameters(
            [{ type: "address[]" }],
            [[deployment.contracts.ftsoV2, address("a")]],
          ),
        });
      }
      return Response.json({ result: healthyRpcResult(request) });
    }) as unknown as typeof fetch;
    const result = await checkDeploymentHealth(deployment, { fetchImpl, now: () => now });
    expect(result.status).toBe("degraded");
    expect(result.checks.flareRegistry.detail).toContain("AssetManagerFXRP");
  });

  it("reports degraded when one deployed address has no code", async () => {
    let codeCalls = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/info")) {
        return Response.json({ machineData: { extensionId: deployment.fcc.extensionId } });
      }
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      if (request.method !== "eth_getCode") {
        return Response.json({ result: healthyRpcResult(request) });
      }
      codeCalls += 1;
      return Response.json({ result: codeCalls === 1 ? "0x" : "0x6000" });
    }) as unknown as typeof fetch;
    const result = await checkDeploymentHealth(deployment, { fetchImpl, now: () => now });
    expect(result.status).toBe("degraded");
    expect(result.checks.vaultFactory.state).toBe("fail");
  });

  it("reports degraded when the FCC availability window has expired", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/info")) {
        return Response.json({ machineData: { extensionId: deployment.fcc.extensionId } });
      }
      const request = JSON.parse(String(init?.body)) as RpcRequest;
      const callData = String(request.params?.[0]?.data);
      const result = request.method === "eth_call"
        && callData.startsWith(toFunctionSelector("getLastStatusChangeTs(address)"))
        ? encodeAbiParameters(
          [{ type: "uint256" }],
          [BigInt(Math.floor(now.getTime() / 1_000) - 6 * 60 * 60 - 1)],
        )
        : healthyRpcResult(request);
      return Response.json({ result });
    }) as unknown as typeof fetch;
    const result = await checkDeploymentHealth(deployment, { fetchImpl, now: () => now });
    expect(result.status).toBe("degraded");
    expect(result.checks.fccAvailability.detail).toBe("FCC availability check has expired");
  });
});

function codeForTeeCall(data: string): `0x${string}` {
  if (data.startsWith(toFunctionSelector("getContractAddressesByName(string[])"))) {
    return encodeAbiParameters(
      [{ type: "address[]" }],
      [[deployment.contracts.ftsoV2, deployment.contracts.assetManager]],
    );
  }
  if (data.startsWith(toFunctionSelector("getTeeMachineStatus(address)"))) {
    return encodeAbiParameters([{ type: "uint8" }], [2]);
  }
  if (data.startsWith(toFunctionSelector("getExtensionId(address)"))) {
    return encodeAbiParameters([{ type: "uint256" }], [BigInt(`0x${"8".repeat(64)}`)]);
  }
  if (data.startsWith(toFunctionSelector("getTeeMachine(address)"))) {
    return encodeAbiParameters(
      [{
        type: "tuple",
        components: [
          { name: "teeId", type: "address" },
          { name: "teeProxyId", type: "address" },
          { name: "url", type: "string" },
        ],
      }],
      [{ teeId: deployment.fcc.teeMachine, teeProxyId: address("9"), url: deployment.fcc.proxyUrl }],
    );
  }
  if (data.startsWith(toFunctionSelector("getLastStatusChangeTs(address)"))) {
    return encodeAbiParameters(
      [{ type: "uint256" }],
      [BigInt(Math.floor(now.getTime() / 1_000))],
    );
  }
  return encodeAbiParameters(
    [{ type: "address[]" }, { type: "string[]" }],
    [[deployment.fcc.teeMachine], [deployment.fcc.proxyUrl]],
  );
}

interface RpcRequest {
  method: string;
  params?: Array<{ data?: string }>;
}

function healthyRpcResult(request: RpcRequest) {
  if (request.method === "eth_chainId") return "0x72";
  if (request.method === "eth_blockNumber") return "0x10000";
  if (request.method === "eth_call") return codeForTeeCall(String(request.params?.[0]?.data));
  return "0x6000";
}
