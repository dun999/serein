import { Constants, Network } from "@flarenetwork/flare-tx-sdk";
import type { Address } from "viem";

import { assetManagerAbi } from "./flare-abi.js";

/**
 * Flare SDK network wrapper.
 *
 * The official `@flarenetwork/flare-tx-sdk` is the trust anchor for every
 * Flare-owned address. `Constants.COSTON2.address_FlareContractRegistry` is
 * the registry address that sits at the same location on every Flare network;
 * the SDK resolves contract names through it on every call, so a Flare-side
 * redeploy needs no release here.
 */
export const FLARE_CONTRACT_REGISTRY_ADDRESS: Address =
  Constants.COSTON2.address_FlareContractRegistry as Address;

/** Flare-owned contracts this app resolves rather than hard-codes. */
export interface FlareContracts {
  ftsoV2: Address;
  assetManager: Address;
  fxrp: Address;
}

/** 21-byte FTSOv2 feed id for XRP/USD, "XRP/USD". */
export const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as const satisfies Address;

export interface XrpUsdPrice {
  /** Scaled feed value; divide by 10^decimals for the USD price. */
  value: bigint;
  /** Number of decimals in `value`. */
  decimals: number;
  /** Unix time the feed observation was produced on Flare. */
  timestamp: bigint;
  /** Human-readable XRP/USD price. */
  priceUsd: number;
}

/**
 * FTSOv2 declares `getFeedById` as payable, but the feed read itself is free
 * and needs no value. The SDK's ethers-based call helper can only static-call
 * functions it considers non-payable, so the same ABI is declared `view` for
 * reading; the on-chain call is an ordinary zero-value `eth_call`.
 */
const ftsoV2ReadAbi = [
  {
    inputs: [{ internalType: "bytes21", name: "_feedId", type: "bytes21" }],
    name: "getFeedById",
    outputs: [
      { internalType: "uint256", name: "_value", type: "uint256" },
      { internalType: "int8", name: "_decimals", type: "int8" },
      { internalType: "uint64", name: "_timestamp", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Creates an SDK `Network` bound to a deployment's RPC endpoint. Without an
 * explicit endpoint the shared Coston2 `Network` singleton (Flare public RPC)
 * is returned; both constants come from `@flarenetwork/flare-tx-sdk`.
 *
 * A custom network builds a fresh `Constants` instance instead of
 * `Constants.COSTON2.copy()`: the SDK's `copy()` round-trips through JSON and
 * loses the class prototype, which `Network` requires.
 */
export function createFlareNetwork(rpcUrl?: string): Network {
  if (!rpcUrl || rpcUrl === Constants.COSTON2.rpc) return Network.COSTON2;
  const constants = new Constants();
  constants.hrp = Constants.COSTON2.hrp;
  constants.rpc = rpcUrl;
  constants.api_FdcVerifiersBaseUrl = Constants.COSTON2.api_FdcVerifiersBaseUrl;
  constants.api_FdcDABaseUrl = Constants.COSTON2.api_FdcDABaseUrl;
  return new Network(constants);
}

/**
 * Resolves the Flare-owned addresses from Flare's own registry through the
 * official SDK, so a redeploy on Flare's side does not need a release here.
 *
 * FXRP is deliberately not read from the registry: the FAsset token is not
 * registered under its own name, and taking it from `assetManager.fAsset()`
 * guarantees the token matches the asset manager we are about to call.
 */
export async function resolveFlareContracts(network: Network): Promise<FlareContracts> {
  const contracts = await network.getFlareContracts();
  const ftsoV2 = findAddress(contracts, "FtsoV2");
  const assetManager = findAddress(contracts, "AssetManagerFXRP");
  if (!ftsoV2) throw new Error("FtsoV2 is not registered in the Flare contract registry");
  if (!assetManager) {
    throw new Error("AssetManagerFXRP is not registered in the Flare contract registry");
  }

  const fxrp = await network.invokeContractCallOnC(
    assetManager,
    // The SDK's ABI parameter is typed as a string; the generated ABI array
    // is passed through a constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assetManagerAbi as any,
    "fAsset",
  );

  return { ftsoV2, assetManager, fxrp };
}

/**
 * Reads the current XRP/USD feed straight from Flare's deployed FTSOv2
 * contract. The SDK resolves the `FtsoV2` name through the Flare contract
 * registry on every call, then performs the read on the resolved address.
 * Returns the raw feed observation plus a human-readable USD price.
 */
export async function readXrpUsdPrice(network: Network): Promise<XrpUsdPrice> {
  const [value, decimals, timestamp] = (await network.invokeContractCallOnC(
    "FtsoV2",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ftsoV2ReadAbi as any,
    "getFeedById",
    XRP_USD_FEED_ID,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any) as [bigint, bigint, bigint];

  return {
    value,
    decimals: Number(decimals),
    timestamp,
    priceUsd: Number(value) / 10 ** Number(decimals),
  };
}

function findAddress(contracts: { name: string; address: string }[], name: string): Address | null {
  const match = contracts.find((contract) => contract.name.toLowerCase() === name.toLowerCase());
  return match ? (match.address as Address) : null;
}