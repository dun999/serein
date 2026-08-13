import "server-only";

import { createPublicClient, http, isAddress } from "viem";

import { PUBLIC_DEPLOYMENT, ZERO_ADDRESS } from "@/lib/deployment";
import { buildDirectMintXamanPayload, validateDirectMintInput } from "@/lib/xaman";

const XAMAN_API = "https://xumm.app/api/v1/platform";
const directMintAbi = [
  {
    type: "function",
    name: "directMintingPaymentAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "getDirectMintingMinimumFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingExecutorFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
const factoryAbi = [
  {
    type: "function",
    name: "isVault",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export async function POST(request: Request) {
  const configuration = config();
  if (configuration instanceof Response) return configuration;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = validateDirectMintInput(body);
  if (!input.ok) return Response.json({ error: input.error }, { status: 400 });

  try {
    const publicClient = createPublicClient({ transport: http(configuration.rpcUrl) });
    const [knownVault, destination, minimumFee, executorFee] = await Promise.all([
      publicClient.readContract({
        address: configuration.factory,
        abi: factoryAbi,
        functionName: "isVault",
        args: [input.recipient],
      }),
      publicClient.readContract({
        address: configuration.assetManager,
        abi: directMintAbi,
        functionName: "directMintingPaymentAddress",
      }),
      publicClient.readContract({
        address: configuration.assetManager,
        abi: directMintAbi,
        functionName: "getDirectMintingMinimumFeeUBA",
      }),
      publicClient.readContract({
        address: configuration.assetManager,
        abi: directMintAbi,
        functionName: "getDirectMintingExecutorFeeUBA",
      }),
    ]);
    if (!knownVault) {
      return Response.json({ error: "Direct mint recipient is not a Serein vault" }, { status: 400 });
    }
    if (!destination) throw new Error("FAssets direct minting is not currently available");
    if (input.amountDrops <= minimumFee + executorFee) {
      return Response.json({ error: "XRP amount is too small after direct-mint fees" }, { status: 400 });
    }

    const memo = `464250526641001800000000${input.recipient.slice(2).toLowerCase()}`;
    const response = await fetch(`${XAMAN_API}/payload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": configuration.apiKey,
        "x-api-secret": configuration.apiSecret,
      },
      body: JSON.stringify(buildDirectMintXamanPayload(destination, input.amountDrops, memo)),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as {
      uuid?: string;
      next?: { always?: string };
      refs?: { qr_png?: string };
      error?: { reference?: string };
    };
    if (!response.ok || !body.uuid || !body.next?.always) {
      return Response.json(
        { error: body.error?.reference ?? "Xaman could not create the signing request" },
        { status: response.ok ? 502 : response.status },
      );
    }
    return Response.json({
      uuid: body.uuid,
      deeplink: body.next.always,
      qr: body.refs?.qr_png,
      destination,
      memo,
    });
  } catch (error) {
    return Response.json(
      { error: safeUpstreamError(error, "Could not prepare direct mint") },
      { status: 502 },
    );
  }
}

function safeUpstreamError(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "Xaman or Coston2 timed out";
  if (error instanceof Error && /direct minting is not currently available|too small/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}

function config():
  | {
      apiKey: string;
      apiSecret: string;
      rpcUrl: string;
      assetManager: `0x${string}`;
      factory: `0x${string}`;
    }
  | Response {
  const apiKey = process.env.XAMAN_API_KEY?.trim();
  const apiSecret = process.env.XAMAN_API_SECRET?.trim();
  const rpcUrl = PUBLIC_DEPLOYMENT.rpcUrl;
  const assetManager = PUBLIC_DEPLOYMENT.contracts.assetManager;
  const factory = PUBLIC_DEPLOYMENT.contracts.vaultFactory;
  if (
    !apiKey ||
    !apiSecret ||
    !rpcUrl ||
    !assetManager ||
    assetManager === ZERO_ADDRESS ||
    !isAddress(assetManager) ||
    !factory ||
    factory === ZERO_ADDRESS ||
    !isAddress(factory)
  ) {
    return Response.json({ error: "Xaman direct mint is not configured" }, { status: 503 });
  }
  return { apiKey, apiSecret, rpcUrl, assetManager, factory };
}
