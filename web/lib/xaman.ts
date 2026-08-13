import { getAddress, isAddress, type Address } from "viem";

export const XAMAN_DIRECT_MINT_NETWORK = "TESTNET" as const;

export type XamanPayloadOutcome =
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "expired" }
  | { status: "wrong-network"; network: string }
  | {
      status: "awaiting-ledger";
      transaction: string;
      request: XrplPaymentTemplate;
      signer?: string;
    };

export interface XrplPaymentTemplate {
  TransactionType?: unknown;
  Destination?: unknown;
  Amount?: unknown;
  DestinationTag?: unknown;
  Memos?: unknown;
}

export interface XrplTransactionResult extends XrplPaymentTemplate {
  Account?: unknown;
  hash?: unknown;
  validated?: unknown;
  meta?: {
    TransactionResult?: unknown;
    delivered_amount?: unknown;
  };
}

export type DirectMintInput =
  | { ok: true; recipient: Address; amountDrops: bigint }
  | { ok: false; error: string };

export function validateDirectMintInput(input: unknown): DirectMintInput {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid JSON body" };
  const body = input as { recipient?: unknown; amountDrops?: unknown };
  if (typeof body.recipient !== "string" || !isAddress(body.recipient)) {
    return { ok: false, error: "A valid Flare recipient is required" };
  }
  if (typeof body.amountDrops !== "string" || !/^[1-9]\d*$/.test(body.amountDrops)) {
    return { ok: false, error: "A positive XRP amount in drops is required" };
  }
  const amountDrops = BigInt(body.amountDrops);
  if (amountDrops > 100_000_000_000n) {
    return { ok: false, error: "Direct-mint request is above the testnet UI limit" };
  }
  return { ok: true, recipient: getAddress(body.recipient), amountDrops };
}

export function isXamanPayloadId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function buildDirectMintXamanPayload(destination: string, amountDrops: bigint, memo: string) {
  return {
    txjson: {
      TransactionType: "Payment" as const,
      Destination: destination,
      Amount: amountDrops.toString(),
      Memos: [{ Memo: { MemoData: memo } }],
    },
    options: {
      submit: true,
      force_network: XAMAN_DIRECT_MINT_NETWORK,
    },
    custom_meta: {
      instruction: "XRPL Testnet only. Do not use real XRP.",
    },
  };
}

/**
 * Interpret the full payload fetched from Xaman. A signed payload is never
 * treated as cancelled merely because dispatch metadata has not propagated
 * yet; the XRPL Testnet ledger is the final network and payment authority.
 */
export function inspectXamanPayload(input: unknown): XamanPayloadOutcome {
  if (!input || typeof input !== "object") return { status: "pending" };
  const body = input as {
    meta?: { resolved?: unknown; signed?: unknown; cancelled?: unknown; expired?: unknown };
    payload?: { request_json?: unknown };
    response?: {
      txid?: unknown;
      account?: unknown;
      dispatched_nodetype?: unknown;
      environment_nodetype?: unknown;
    };
  };
  const resolved = body.meta?.resolved === true;
  const signed = body.meta?.signed === true;

  if (resolved && signed) {
    const network = firstNonEmptyString(
      body.response?.dispatched_nodetype,
      body.response?.environment_nodetype,
    );
    if (network && network.toUpperCase() !== XAMAN_DIRECT_MINT_NETWORK) {
      return { status: "wrong-network", network };
    }
    const transaction = typeof body.response?.txid === "string" ? body.response.txid.trim() : "";
    const request = body.payload?.request_json;
    if (!/^[0-9A-F]{64}$/i.test(transaction) || !request || typeof request !== "object") {
      return { status: "pending" };
    }
    return {
      status: "awaiting-ledger",
      transaction: transaction.toUpperCase(),
      request: request as XrplPaymentTemplate,
      ...(typeof body.response?.account === "string" ? { signer: body.response.account } : {}),
    };
  }

  if (resolved) return { status: "rejected" };
  if (body.meta?.cancelled === true) return { status: "rejected" };
  if (body.meta?.expired === true) return { status: "expired" };
  return { status: "pending" };
}

export function verifyXrplTestnetPayment(
  result: XrplTransactionResult,
  transaction: string,
  request: XrplPaymentTemplate,
  signer?: string,
): boolean {
  const requestedAmount = asString(request.Amount);
  const deliveredAmount = asString(result.meta?.delivered_amount);
  return (
    result.validated === true &&
    result.meta?.TransactionResult === "tesSUCCESS" &&
    asString(result.hash).toUpperCase() === transaction.toUpperCase() &&
    result.TransactionType === "Payment" &&
    request.TransactionType === "Payment" &&
    asString(result.Destination) === asString(request.Destination) &&
    asString(result.Amount) === requestedAmount &&
    deliveredAmount === requestedAmount &&
    sameOptionalNumber(result.DestinationTag, request.DestinationTag) &&
    memoData(result.Memos) === memoData(request.Memos) &&
    (!signer || asString(result.Account) === signer)
  );
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function sameOptionalNumber(actual: unknown, expected: unknown): boolean {
  if (actual === undefined && expected === undefined) return true;
  return asString(actual) === asString(expected);
}

function memoData(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const memo = (entry as { Memo?: unknown }).Memo;
      if (!memo || typeof memo !== "object") return "";
      const data = (memo as { MemoData?: unknown }).MemoData;
      return typeof data === "string" ? data.toUpperCase() : "";
    })
    .join(":");
}
