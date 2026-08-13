import { describe, expect, it } from "vitest";

import {
  buildDirectMintXamanPayload,
  inspectXamanPayload,
  isXamanPayloadId,
  validateDirectMintInput,
  verifyXrplTestnetPayment,
  XAMAN_DIRECT_MINT_NETWORK,
} from "@/lib/xaman";

describe("Xaman boundary validation", () => {
  it("accepts only positive bounded drops sent to an EVM address", () => {
    const result = validateDirectMintInput({
      recipient: "0x1111111111111111111111111111111111111111",
      amountDrops: "1000000",
    });
    expect(result).toMatchObject({ ok: true, amountDrops: 1_000_000n });
  });

  it.each(["0", "-1", "1.5", "100000000001"])("rejects unsafe amount %s", (amountDrops) => {
    expect(validateDirectMintInput({
      recipient: "0x1111111111111111111111111111111111111111",
      amountDrops,
    }).ok).toBe(false);
  });

  it("requires a canonical UUID before calling Xaman", () => {
    expect(isXamanPayloadId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isXamanPayloadId("../../secret")).toBe(false);
    expect(isXamanPayloadId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(false);
  });

  it("forces direct-mint signing requests onto XRPL Testnet", () => {
    const payload = buildDirectMintXamanPayload("rTestDestination", 1_000_000n, "ABCD");

    expect(XAMAN_DIRECT_MINT_NETWORK).toBe("TESTNET");
    expect(payload.options).toEqual({ submit: true, force_network: "TESTNET" });
    expect(payload.custom_meta.instruction).toContain("Do not use real XRP");
  });

  it("does not call a signed request cancelled while Xaman dispatch metadata propagates", () => {
    const outcome = inspectXamanPayload({
      meta: { resolved: true, signed: true, expired: true },
      payload: { request_json: paymentTemplate },
      response: { txid: transactionHash, dispatched_nodetype: "" },
    });

    expect(outcome.status).toBe("awaiting-ledger");
  });

  it("rejects an explicitly non-Testnet dispatch", () => {
    expect(inspectXamanPayload({
      meta: { resolved: true, signed: true },
      payload: { request_json: paymentTemplate },
      response: { txid: transactionHash, dispatched_nodetype: "MAINNET" },
    })).toEqual({ status: "wrong-network", network: "MAINNET" });
  });

  it("accepts only the exact validated XRPL Testnet payment", () => {
    const ledgerTransaction = {
      ...paymentTemplate,
      Account: "rnVmbu8wUD28mqwn88KsB8vATTMLkZn5p5",
      hash: transactionHash,
      validated: true,
      meta: { TransactionResult: "tesSUCCESS", delivered_amount: "10000000" },
    };

    expect(verifyXrplTestnetPayment(
      ledgerTransaction,
      transactionHash,
      paymentTemplate,
      ledgerTransaction.Account,
    )).toBe(true);
    expect(verifyXrplTestnetPayment(
      { ...ledgerTransaction, Destination: "rWrongDestination" },
      transactionHash,
      paymentTemplate,
      ledgerTransaction.Account,
    )).toBe(false);
  });
});

const transactionHash = "D9D4FA29CA3500167299A337B849E0AFB0B7EC9E3E5B15016DB3A3E0DF599575";
const paymentTemplate = {
  TransactionType: "Payment",
  Destination: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
  Amount: "10000000",
  Memos: [{ Memo: { MemoData: "4642505266410018000000009E952EC850C91EF19E09FE787E13FF5C649CF7FB" } }],
};
