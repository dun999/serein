import { describe, expect, it } from "vitest";

import {
  createFlareNetwork,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  readXrpUsdPrice,
  resolveFlareContracts,
  XRP_USD_FEED_ID,
  type FlareContracts,
} from "../src/flare-registry.js";

const FTSO = "0x1111111111111111111111111111111111111111" as const;
const ASSET_MANAGER = "0x2222222222222222222222222222222222222222" as const;
const FXRP = "0x3333333333333333333333333333333333333333" as const;

function mockNetwork() {
  const calls: string[] = [];
  const network = {
    getFlareContracts: async () => [
      { name: "FtsoV2", address: FTSO },
      { name: "AssetManagerFXRP", address: ASSET_MANAGER },
    ],
    invokeContractCallOnC: async (contract: string, _abi: string, method: string, ...params: unknown[]) => {
      calls.push(`${contract}.${method}`);
      if (contract === ASSET_MANAGER && method === "fAsset") return FXRP;
      if (method === "getFeedById") return [500_000n, 6n, 1_700_000_000n];
      throw new Error(`unexpected call ${contract}.${method}(${String(params)})`);
    },
  };
  return { network: network as never, calls };
}

describe("Flare contract registry", () => {
  it("resolves every Flare-owned address from the registry via the Flare SDK", async () => {
    const { network } = mockNetwork();
    const contracts: FlareContracts = await resolveFlareContracts(network);

    expect(contracts.ftsoV2).toBe(FTSO);
    expect(contracts.assetManager).toBe(ASSET_MANAGER);
    expect(contracts.fxrp).toBe(FXRP);
  });

  it("reads the XRP/USD feed through the Flare SDK", async () => {
    const { network, calls } = mockNetwork();
    const price = await readXrpUsdPrice(network);

    expect(price.value).toBe(500_000n);
    expect(price.decimals).toBe(6);
    expect(price.timestamp).toBe(1_700_000_000n);
    expect(price.priceUsd).toBe(0.5);
    expect(calls).toContain("FtsoV2.getFeedById");
  });

  it("queries the XRP/USD feed id", () => {
    expect(XRP_USD_FEED_ID).toBe("0x015852502f55534400000000000000000000000000");
  });

  it("keeps the Flare registry trust anchor from the Flare SDK", () => {
    expect(FLARE_CONTRACT_REGISTRY_ADDRESS).toBe("0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019");
  });

  it("builds a network on the deployment RPC when it differs from Flare public RPC", () => {
    const custom = createFlareNetwork("https://example.invalid/rpc");
    expect(custom).not.toBe(createFlareNetwork());
  });
});
