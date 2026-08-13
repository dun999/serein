import { describe, expect, it } from "vitest";

import { buildPublicDeployment, isDeploymentConfigured, ZERO_ADDRESS } from "@/lib/deployment";

const address = (digit: string) => `0x${digit.repeat(40)}`;

describe("public deployment configuration", () => {
  it("fails closed when release values are absent", () => {
    const deployment = buildPublicDeployment({}, { useManifest: false });
    expect(deployment.contracts.vaultFactory).toBe(ZERO_ADDRESS);
    expect(isDeploymentConfigured(deployment)).toBe(false);
  });

  it("accepts one complete Coston2 release", () => {
    const deployment = buildPublicDeployment({
      vaultFactory: address("1"),
      instructionSender: address("2"),
      fxrp: address("3"),
      assetManager: address("4"),
      ftsoV2: address("5"),
      teeMachineRegistry: address("6"),
      teeMachine: address("7"),
      extensionId: `0x${"8".repeat(64)}`,
      proxyUrl: "https://fcc.example/",
    });
    expect(deployment.fcc.proxyUrl).toBe("https://fcc.example");
    expect(isDeploymentConfigured(deployment)).toBe(true);
  });

  it("rejects insecure public proxy URLs", () => {
    const deployment = buildPublicDeployment({ proxyUrl: "http://fcc.example" });
    expect(deployment.fcc.proxyUrl).toBe("");
  });
});
