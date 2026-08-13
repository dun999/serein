import "server-only";

import {
  inspectXamanPayload,
  isXamanPayloadId,
  verifyXrplTestnetPayment,
  type XrplTransactionResult,
} from "@/lib/xaman";

const XAMAN_API = "https://xumm.app/api/v1/platform";
const XRPL_TESTNET_RPC = "https://s.altnet.rippletest.net:51234/";

export async function GET(_request: Request, context: RouteContext<"/api/xaman/payload/[uuid]">) {
  const apiKey = process.env.XAMAN_API_KEY?.trim();
  const apiSecret = process.env.XAMAN_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    return Response.json({ error: "Xaman is not configured" }, { status: 503 });
  }
  const { uuid } = await context.params;
  if (!isXamanPayloadId(uuid)) {
    return Response.json({ error: "Invalid Xaman payload ID" }, { status: 400 });
  }
  try {
    const response = await fetch(`${XAMAN_API}/payload/${uuid}`, {
      headers: { "x-api-key": apiKey, "x-api-secret": apiSecret },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as { error?: { reference?: string } };
    if (!response.ok) {
      return Response.json(
        { error: body.error?.reference ?? "Could not read Xaman payload" },
        { status: response.status },
      );
    }
    const outcome = inspectXamanPayload(body);
    if (outcome.status === "rejected") {
      return Response.json({ status: "rejected", signed: false, cancelled: true });
    }
    if (outcome.status === "expired") {
      return Response.json({ status: "expired", signed: false, cancelled: true });
    }
    if (outcome.status === "wrong-network") {
      return Response.json({
        status: "wrong-network",
        signed: false,
        cancelled: true,
        networkRejected: true,
        network: outcome.network,
      });
    }
    if (outcome.status !== "awaiting-ledger") {
      return Response.json({ status: "pending", signed: false, cancelled: false });
    }

    const ledger = await readXrplTestnetTransaction(outcome.transaction);
    if (ledger === null) {
      return Response.json({
        status: "confirming",
        signed: false,
        cancelled: false,
        transaction: outcome.transaction,
      });
    }
    if (!verifyXrplTestnetPayment(ledger, outcome.transaction, outcome.request, outcome.signer)) {
      return Response.json({
        status: "invalid",
        signed: false,
        cancelled: true,
        transaction: outcome.transaction,
      });
    }
    return Response.json({
      status: "submitted",
      signed: true,
      cancelled: false,
      transaction: outcome.transaction,
    });
  } catch {
    return Response.json({ error: "Xaman payload status is temporarily unavailable" }, { status: 502 });
  }
}

async function readXrplTestnetTransaction(transaction: string): Promise<XrplTransactionResult | null> {
  const response = await fetch(XRPL_TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "tx",
      params: [{ transaction, binary: false }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("XRPL Testnet lookup failed");
  const body = (await response.json()) as {
    result?: XrplTransactionResult & { error?: string };
  };
  if (body.result?.error === "txnNotFound") return null;
  if (!body.result) throw new Error("XRPL Testnet returned no transaction");
  return body.result;
}
