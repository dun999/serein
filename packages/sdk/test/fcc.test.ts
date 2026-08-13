import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, stringToHex } from "viem";

import { FccClient } from "../src/fcc.js";
import { instructionSenderAbi } from "../src/private-abi.js";
import { FccInfrastructureError, PolicyViolation } from "../src/types.js";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as const;
const SENDER = "0x4444444444444444444444444444444444444444" as const;
const INSTRUCTION_ID = `0x${"5".repeat(64)}` as const;
const TRANSACTION = `0x${"6".repeat(64)}` as const;

describe("FCC refusal evidence", () => {
  it("attaches the confirmed instruction transaction to a policy refusal", async () => {
    const topics = encodeEventTopics({
      abi: instructionSenderAbi,
      eventName: "AuthorizationRequested",
      args: { instructionId: INSTRUCTION_ID, vault: VAULT, requester: OWNER },
    });
    const client = new FccClient({
      instructionSender: SENDER,
      proxyUrl: "https://fcc.example",
      publicClient: {
        simulateContract: async () => ({ request: {} }),
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [{
            address: SENDER,
            topics,
            data: encodeAbiParameters(
              [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
              [stringToHex("AUTHORIZE_SPEND", { size: 32 }), RECIPIENT, 1_000_000n],
            ),
          }],
        }),
      } as never,
      walletClient: {
        account: { address: OWNER },
        writeContract: async () => TRANSACTION,
      } as never,
      fetchImpl: async () => Response.json({ result: { status: 0, log: "recipient denied" } }),
    });

    const refusal = await client.authorizeSpend({ vault: VAULT, to: RECIPIENT, amount: 1_000_000n })
      .then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(PolicyViolation);
    expect((refusal as PolicyViolation).instructionTransaction).toBe(TRANSACTION);
  });

  it("preserves instruction evidence when the TEE extension fails", async () => {
    const topics = encodeEventTopics({
      abi: instructionSenderAbi,
      eventName: "AuthorizationRequested",
      args: { instructionId: INSTRUCTION_ID, vault: VAULT, requester: OWNER },
    });
    const client = new FccClient({
      instructionSender: SENDER,
      proxyUrl: "https://fcc.example",
      publicClient: {
        simulateContract: async () => ({ request: {} }),
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [{
            address: SENDER,
            topics,
            data: encodeAbiParameters(
              [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
              [stringToHex("AUTHORIZE_SPEND", { size: 32 }), RECIPIENT, 1_000_000n],
            ),
          }],
        }),
      } as never,
      walletClient: {
        account: { address: OWNER },
        writeContract: async () => TRANSACTION,
      } as never,
      fetchImpl: async () => Response.json({
        result: {
          status: 3,
          log: 'Post "http://localhost:7702/action": context deadline exceeded',
          data: "0x",
        },
      }),
    });

    const failure = await client.authorizeSpend({ vault: VAULT, to: RECIPIENT, amount: 1_000_000n })
      .then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(FccInfrastructureError);
    expect((failure as FccInfrastructureError).instructionId).toBe(INSTRUCTION_ID);
    expect((failure as FccInfrastructureError).instructionTransaction).toBe(TRANSACTION);
    expect((failure as Error).message).toContain("context deadline exceeded");
  });
});
