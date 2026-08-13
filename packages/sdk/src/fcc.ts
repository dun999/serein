import {
  hexToString,
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

import { instructionSenderAbi } from "./private-abi.js";
import {
  encodePasskeyProof,
  VaultAdminAction,
  VaultOperation,
  type PasskeyProof,
} from "./private-policy.js";
import { CovenantError, FccInfrastructureError, PolicyViolation } from "./types.js";

export interface FccAuthorization {
  tee: Address;
  authorization: Hex;
  digest: Hex;
  nonce: bigint;
  deadline: bigint;
  amountUsd: bigint;
  priceTimestamp: bigint;
  policyVersion: bigint;
  operation: VaultOperation;
  xrplPayout?: string;
  instructionId: Hex;
  instructionTransaction: Hex;
}

export interface FccAdminAuthorization {
  tee: Address;
  authorization: Hex;
  digest: Hex;
  nonce: bigint;
  deadline: bigint;
  policyVersion: bigint;
  adminAction: VaultAdminAction;
  payloadHash: Hex;
  instructionId: Hex;
  instructionTransaction: Hex;
}

export interface FccClientOptions {
  instructionSender: Address;
  proxyUrl: string;
  publicClient: PublicClient;
  walletClient: WalletClient;
  instructionFee?: bigint;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class FccClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: FccClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async authorizeSpend(args: {
    vault: Address;
    to: Address;
    amount: bigint;
    stepUpProof?: PasskeyProof;
  }): Promise<FccAuthorization> {
    return this.request("requestSpend", [args.vault, args.to, args.amount, encodePasskeyProof(args.stepUpProof)]);
  }

  async authorizeWithdraw(args: {
    vault: Address;
    amount: bigint;
    stepUpProof?: PasskeyProof;
  }): Promise<FccAuthorization> {
    return this.request("requestWithdraw", [args.vault, args.amount, encodePasskeyProof(args.stepUpProof)]);
  }

  async authorizeRedeem(args: {
    vault: Address;
    amount: bigint;
    stepUpProof?: PasskeyProof;
  }): Promise<FccAuthorization> {
    return this.request("requestRedeem", [args.vault, args.amount, encodePasskeyProof(args.stepUpProof)]);
  }

  async authorizeAdmin(args: {
    vault: Address;
    action: VaultAdminAction;
    payloadHash: Hex;
    stepUpProof: PasskeyProof;
  }): Promise<FccAdminAuthorization> {
    const response = await this.requestRaw("requestAdmin", [
      args.vault,
      args.action,
      args.payloadHash,
      encodePasskeyProof(args.stepUpProof),
    ]);
    const { decoded } = response;
    return {
      tee: decoded.tee as Address,
      authorization: decoded.authorization as Hex,
      digest: decoded.digest as Hex,
      nonce: BigInt(String(decoded.nonce)),
      deadline: BigInt(String(decoded.deadline)),
      policyVersion: BigInt(String(decoded.policyVersion)),
      adminAction: Number(decoded.adminAction) as VaultAdminAction,
      payloadHash: decoded.payloadHash as Hex,
      instructionId: response.instructionId,
      instructionTransaction: response.instructionTransaction,
    };
  }

  private get account(): Account {
    if (!this.options.walletClient.account) throw new CovenantError("a connected wallet is required");
    return this.options.walletClient.account;
  }

  private get chain(): Chain | undefined {
    return this.options.walletClient.chain ?? undefined;
  }

  private async request(functionName: string, args: readonly unknown[]): Promise<FccAuthorization> {
    const response = await this.requestRaw(functionName, args);
    const decoded = response.decoded;
    return {
      tee: decoded.tee as Address,
      authorization: decoded.authorization as Hex,
      digest: decoded.digest as Hex,
      nonce: BigInt(String(decoded.nonce)),
      deadline: BigInt(String(decoded.deadline)),
      amountUsd: BigInt(String(decoded.amountUsd)),
      priceTimestamp: BigInt(String(decoded.priceTimestamp)),
      policyVersion: BigInt(String(decoded.policyVersion)),
      operation: Number(decoded.operation) as VaultOperation,
      ...(decoded.xrplPayout ? { xrplPayout: String(decoded.xrplPayout) } : {}),
      instructionId: response.instructionId,
      instructionTransaction: response.instructionTransaction,
    };
  }

  private async requestRaw(functionName: string, args: readonly unknown[]): Promise<{
    decoded: Record<string, unknown>;
    instructionId: Hex;
    instructionTransaction: Hex;
  }> {
    const { request } = await this.options.publicClient.simulateContract({
      address: this.options.instructionSender,
      abi: instructionSenderAbi,
      functionName,
      args,
      account: this.account,
      chain: this.chain,
      value: this.options.instructionFee ?? 1_000_000n,
      // viem cannot preserve the generated union after a dynamic function selection.
    } as never);
    // viem's dynamic function union cannot be retained across this generic FCC boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await this.options.walletClient.writeContract(request as any);
    const receipt = await this.options.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new CovenantError("FCC instruction transaction reverted");

    const events = parseEventLogs({
      abi: instructionSenderAbi,
      eventName: "AuthorizationRequested",
      logs: receipt.logs,
    });
    const instructionId = events[0]?.args.instructionId;
    if (!instructionId) throw new CovenantError("FCC instruction ID was not emitted");
    try {
      const decoded = await this.poll(instructionId);
      return { decoded, instructionId, instructionTransaction: hash };
    } catch (error) {
      const refusal = policyRefusal(error);
      if (refusal) {
        throw new PolicyViolation(refusal.message, refusal.reason, hash);
      }
      const message = error instanceof Error ? error.message : "FCC authorization failed";
      throw new FccInfrastructureError(message, instructionId, hash, error);
    }
  }

  private async poll(instructionId: Hex): Promise<Record<string, unknown>> {
    const timeout = this.options.timeoutMs ?? 120_000;
    const interval = this.options.pollIntervalMs ?? 1_500;
    const started = Date.now();
    const url = `${this.options.proxyUrl.replace(/\/$/, "")}/action/result/${instructionId}`;
    // Every poll is a cross-origin browser read, so a proxy that answers curl
    // can still fail here (CORS, DNS, TLS). Keep the transport failure instead
    // of reporting only that time ran out.
    let transportError: unknown;

    while (Date.now() - started < timeout) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { signal: AbortSignal.timeout(Math.min(interval * 4, 8_000)) });
        transportError = undefined;
      } catch (error) {
        transportError = error;
        if (Date.now() - started >= timeout) break;
        await wait(interval);
        continue;
      }
      if (response.status === 404 || response.status === 202) {
        await wait(interval);
        continue;
      }
      if (!response.ok) throw new CovenantError(`FCC proxy returned ${response.status}`);
      const envelope = (await response.json()) as {
        result?: { status?: number; log?: string; data?: string | Record<string, unknown> };
      };
      const result = envelope.result;
      if (!result || result.status === 2) {
        await wait(interval);
        continue;
      }
      if (result.status === 0) {
        const reason = String(result.log ?? "FCC policy refused this request").replace(/^error:\s*/, "");
        throw new PolicyViolation(reason, reason);
      }
      if (result.status !== 1) {
        const reason = String(result.log ?? "FCC extension did not return an authorization").replace(/^error:\s*/, "");
        throw new CovenantError(`FCC extension failed: ${reason}`);
      }
      const decoded = decodeResultData(result.data);
      return decoded;
    }
    if (transportError) {
      const detail = transportError instanceof Error ? transportError.message : String(transportError);
      throw new CovenantError(`FCC proxy at ${this.options.proxyUrl} was unreachable from this browser: ${detail}`);
    }
    throw new CovenantError("FCC authorization timed out");
  }
}

function policyRefusal(error: unknown): { message: string; reason: string } | null {
  if (error instanceof PolicyViolation) {
    return { message: error.message, reason: error.reason };
  }
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; message?: unknown; reason?: unknown };
  if (
    candidate.name !== "PolicyViolation"
    || typeof candidate.message !== "string"
    || typeof candidate.reason !== "string"
  ) {
    return null;
  }
  return { message: candidate.message, reason: candidate.reason };
}

export function decodeResultData(data: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) throw new CovenantError("FCC result did not include authorization data");
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    if (/^0x[0-9a-f]*$/i.test(data)) {
      return JSON.parse(hexToString(data as Hex)) as Record<string, unknown>;
    }
    const bytes = typeof Buffer !== "undefined"
      ? Buffer.from(data, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(data)));
    return JSON.parse(bytes) as Record<string, unknown>;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
