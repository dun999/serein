import {
  parseEventLogs,
  concatHex,
  hexToBytes,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sha256 } from "@noble/hashes/sha2.js";

import { FccClient, type FccAdminAuthorization, type FccAuthorization } from "./fcc.js";
import { vaultAbi, vaultFactoryAbi } from "./private-abi.js";
import {
  VaultOperation,
  VaultAdminAction,
  addressPayloadHash,
  assertPasskey,
  computeAdminChallenge,
  computeStepUpChallenge,
  encryptPolicy,
  policyPayloadHash,
  type PasskeyPolicy,
  type PrivatePolicy,
  toBase64Url,
} from "./private-policy.js";
import { CovenantError } from "./types.js";

export interface PrivateVaultClientOptions {
  factory: Address;
  fxrp: Address;
  assetManager: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
  fcc: FccClient;
}

export interface PrivateVaultState {
  address: Address;
  owner: Address;
  guardian: Address;
  tee: Address;
  status: "active" | "locked" | "destroyed";
  balance: bigint;
  nonce: bigint;
  policyCommitment: Hex;
  policyVersion: bigint;
  xrplPayout: string;
  timelockSeconds: number;
}

export interface DirectMintSettings {
  paymentAddress: string;
  feeBips: bigint;
  minimumFeeUba: bigint;
  executorFeeUba: bigint;
}

export interface PreparedPolicyProposal {
  authorization: FccAdminAuthorization;
  commitment: Hex;
  ciphertext: Hex;
}

export class PrivateVaultClient {
  constructor(private readonly options: PrivateVaultClientOptions) {}

  async createVault(args: {
    tee: Address;
    guardian?: Address;
    timelockSeconds: number;
    xrplPayout: string;
  }): Promise<{ vault: Address; transaction: Hex }> {
    if (!isValidXrplClassicAddress(args.xrplPayout)) {
      throw new CovenantError("XRPL payout must be a checksum-valid classic r-address");
    }
    const hash = await this.send(
      this.options.factory,
      vaultFactoryAbi,
      "createVault",
      [
        args.tee,
        args.guardian ?? "0x0000000000000000000000000000000000000000",
        args.timelockSeconds,
        args.xrplPayout,
      ],
    );
    const receipt = await this.options.publicClient.getTransactionReceipt({ hash });
    const events = parseEventLogs({ abi: vaultFactoryAbi, eventName: "VaultCreated", logs: receipt.logs });
    const vault = events[0]?.args.vault;
    if (!vault) throw new CovenantError("vault factory did not emit VaultCreated");
    return { vault, transaction: hash };
  }

  async vaultsOf(owner: Address): Promise<readonly Address[]> {
    return this.options.publicClient.readContract({
      address: this.options.factory,
      abi: vaultFactoryAbi,
      functionName: "vaultsOf",
      args: [owner],
    });
  }

  async getState(vault: Address): Promise<PrivateVaultState> {
    const [owner, guardian, tee, status, balance, nonce, commitment, version, payout, timelock] =
      await Promise.all([
        this.read(vault, "owner"),
        this.read(vault, "guardian"),
        this.read(vault, "tee"),
        this.read(vault, "status"),
        this.read(vault, "balance"),
        this.read(vault, "nonce"),
        this.read(vault, "policyCommitment"),
        this.read(vault, "policyVersion"),
        this.read(vault, "xrplPayout"),
        this.read(vault, "timelockSeconds"),
      ]);
    return {
      address: vault,
      owner: owner as Address,
      guardian: guardian as Address,
      tee: tee as Address,
      status: Number(status) === 0 ? "active" : Number(status) === 1 ? "locked" : "destroyed",
      balance: balance as bigint,
      nonce: nonce as bigint,
      policyCommitment: commitment as Hex,
      policyVersion: version as bigint,
      xrplPayout: payout as string,
      timelockSeconds: Number(timelock),
    };
  }

  async initializePolicy(args: {
    vault: Address;
    policy: PrivatePolicy;
  }): Promise<Hex> {
    const policyPublicKey = await this.policyPublicKey(args.vault);
    const encrypted = await encryptPolicy({
      policy: args.policy,
      policyPublicKey,
      chainId: BigInt(await this.options.publicClient.getChainId()),
      vault: args.vault,
      policyVersion: 1n,
    });
    return this.send(args.vault, vaultAbi, "initializePolicy", [encrypted.commitment, encrypted.ciphertext]);
  }

  async proposePolicy(args: {
    vault: Address;
    policy: PrivatePolicy;
    passkey: PasskeyPolicy;
  }): Promise<{ authorization: FccAdminAuthorization; transaction: Hex }> {
    const prepared = await this.authorizePolicyProposal(args);
    const transaction = await this.executePolicyProposal({ vault: args.vault, prepared });
    return { authorization: prepared.authorization, transaction };
  }

  async authorizePolicyProposal(args: {
    vault: Address;
    policy: PrivatePolicy;
    passkey: PasskeyPolicy;
  }): Promise<PreparedPolicyProposal> {
    const state = await this.getState(args.vault);
    const policyPublicKey = await this.policyPublicKey(args.vault);
    const encrypted = await encryptPolicy({
      policy: args.policy,
      policyPublicKey,
      chainId: BigInt(await this.options.publicClient.getChainId()),
      vault: args.vault,
      policyVersion: state.policyVersion + 1n,
    });
    const payloadHash = policyPayloadHash(encrypted.commitment, encrypted.ciphertext);
    const authorization = await this.adminAuthorization({
      vault: args.vault,
      state,
      action: VaultAdminAction.PolicyUpdate,
      payloadHash,
      passkey: args.passkey,
    });
    return {
      authorization,
      commitment: encrypted.commitment,
      ciphertext: encrypted.ciphertext,
    };
  }

  async executePolicyProposal(args: {
    vault: Address;
    prepared: PreparedPolicyProposal;
  }): Promise<Hex> {
    const { authorization } = args.prepared;
    return this.send(args.vault, vaultAbi, "proposePolicy", [
      args.prepared.commitment,
      args.prepared.ciphertext,
      authorization.nonce,
      authorization.policyVersion,
      authorization.deadline,
      authorization.authorization,
    ]);
  }

  async applyPolicy(vault: Address): Promise<Hex> {
    return this.send(vault, vaultAbi, "applyPolicy", []);
  }

  async cancelPolicyProposal(vault: Address): Promise<Hex> {
    return this.send(vault, vaultAbi, "cancelPolicyProposal", []);
  }

  async spend(args: {
    vault: Address;
    to: Address;
    amount: bigint;
    passkey?: PasskeyPolicy;
  }): Promise<{ authorization: FccAuthorization; transaction: Hex }> {
    const authorization = await this.authorizeSpend(args);
    const transaction = await this.executeSpend({
      vault: args.vault,
      to: args.to,
      amount: args.amount,
      authorization,
    });
    return { authorization, transaction };
  }

  async authorizeSpend(args: {
    vault: Address;
    to: Address;
    amount: bigint;
    passkey?: PasskeyPolicy;
  }): Promise<FccAuthorization> {
    const state = await this.getState(args.vault);
    const proof = args.passkey
      ? await assertPasskey(
          args.passkey,
          computeStepUpChallenge({
            chainId: BigInt(await this.options.publicClient.getChainId()),
            vault: args.vault,
            operation: VaultOperation.Spend,
            to: args.to,
            amount: args.amount,
            nonce: state.nonce,
            policyVersion: state.policyVersion,
          }),
        )
      : undefined;
    return this.options.fcc.authorizeSpend({
      vault: args.vault,
      to: args.to,
      amount: args.amount,
      stepUpProof: proof,
    });
  }

  async executeSpend(args: {
    vault: Address;
    to: Address;
    amount: bigint;
    authorization: FccAuthorization;
  }): Promise<Hex> {
    return this.sendAuthorization(args.vault, "spend", [args.to, args.amount], args.authorization);
  }

  async withdraw(args: { vault: Address; amount: bigint; passkey?: PasskeyPolicy }) {
    const authorization = await this.authorizeWithdraw(args);
    const transaction = await this.executeWithdraw({
      vault: args.vault,
      amount: args.amount,
      authorization,
    });
    return { authorization, transaction };
  }

  async authorizeWithdraw(args: { vault: Address; amount: bigint; passkey?: PasskeyPolicy }) {
    const proof = await this.passkeyProof(args.vault, args.amount, VaultOperation.Withdraw, args.passkey);
    return this.options.fcc.authorizeWithdraw({
      vault: args.vault,
      amount: args.amount,
      stepUpProof: proof,
    });
  }

  async executeWithdraw(args: {
    vault: Address;
    amount: bigint;
    authorization: FccAuthorization;
  }): Promise<Hex> {
    return this.sendAuthorization(args.vault, "withdraw", [args.amount], args.authorization);
  }

  async redeemToXrp(args: { vault: Address; amount: bigint; passkey?: PasskeyPolicy }) {
    const authorization = await this.authorizeRedeem(args);
    const transaction = await this.executeRedeem({
      vault: args.vault,
      amount: args.amount,
      authorization,
    });
    return { authorization, transaction };
  }

  async authorizeRedeem(args: { vault: Address; amount: bigint; passkey?: PasskeyPolicy }) {
    const proof = await this.passkeyProof(args.vault, args.amount, VaultOperation.Redeem, args.passkey);
    return this.options.fcc.authorizeRedeem({
      vault: args.vault,
      amount: args.amount,
      stepUpProof: proof,
    });
  }

  async executeRedeem(args: {
    vault: Address;
    amount: bigint;
    authorization: FccAuthorization;
  }): Promise<Hex> {
    return this.sendAuthorization(args.vault, "redeemToXrp", [args.amount], args.authorization);
  }

  async deposit(vault: Address, amount: bigint): Promise<Hex> {
    return this.send(vault, vaultAbi, "deposit", [amount]);
  }

  async approveFxrp(vault: Address, amount: bigint): Promise<Hex> {
    const erc20ApproveAbi = [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ] as const;
    return this.send(this.options.fxrp, erc20ApproveAbi, "approve", [vault, amount]);
  }

  async walletFxrpBalance(owner: Address): Promise<bigint> {
    const erc20BalanceAbi = [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ] as const;
    return this.options.publicClient.readContract({
      address: this.options.fxrp,
      abi: erc20BalanceAbi,
      functionName: "balanceOf",
      args: [owner],
    });
  }

  async directMintSettings(): Promise<DirectMintSettings> {
    const abi = [
      { type: "function", name: "directMintingPaymentAddress", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
      { type: "function", name: "getDirectMintingFeeBIPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
      { type: "function", name: "getDirectMintingMinimumFeeUBA", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
      { type: "function", name: "getDirectMintingExecutorFeeUBA", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    ] as const;
    const [paymentAddress, feeBips, minimumFeeUba, executorFeeUba] = await Promise.all([
      this.options.publicClient.readContract({ address: this.options.assetManager, abi, functionName: "directMintingPaymentAddress" }),
      this.options.publicClient.readContract({ address: this.options.assetManager, abi, functionName: "getDirectMintingFeeBIPS" }),
      this.options.publicClient.readContract({ address: this.options.assetManager, abi, functionName: "getDirectMintingMinimumFeeUBA" }),
      this.options.publicClient.readContract({ address: this.options.assetManager, abi, functionName: "getDirectMintingExecutorFeeUBA" }),
    ]);
    return { paymentAddress, feeBips, minimumFeeUba, executorFeeUba };
  }

  async minimumRedeemAmount(): Promise<bigint> {
    const abi = [
      {
        type: "function",
        name: "minimumRedeemAmountUBA",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
    ] as const;
    return this.options.publicClient.readContract({
      address: this.options.assetManager,
      abi,
      functionName: "minimumRedeemAmountUBA",
    });
  }

  async quote(vault: Address, amount: bigint): Promise<{ amountUsd: bigint; priceTimestamp: bigint }> {
    const { result } = await this.options.publicClient.simulateContract({
      address: vault,
      abi: vaultAbi,
      functionName: "quote",
      args: [amount],
    });
    return { amountUsd: result[0], priceTimestamp: result[1] };
  }

  async lock(vault: Address): Promise<Hex> {
    return this.send(vault, vaultAbi, "lock", []);
  }

  async scheduleRecovery(vault: Address): Promise<Hex> {
    return this.send(vault, vaultAbi, "scheduleRecovery", []);
  }

  async executeRecovery(vault: Address): Promise<Hex> {
    return this.send(vault, vaultAbi, "executeRecovery", []);
  }

  async destroyVault(args: { vault: Address; passkey: PasskeyPolicy }): Promise<{
    authorization: FccAdminAuthorization;
    transaction: Hex;
  }> {
    const authorization = await this.authorizeDestroy(args);
    const transaction = await this.executeDestroy({ vault: args.vault, authorization });
    return { authorization, transaction };
  }

  async authorizeDestroy(args: {
    vault: Address;
    passkey: PasskeyPolicy;
  }): Promise<FccAdminAuthorization> {
    const state = await this.getState(args.vault);
    return this.adminAuthorization({
      vault: args.vault,
      state,
      action: VaultAdminAction.Destroy,
      payloadHash: addressPayloadHash(state.owner),
      passkey: args.passkey,
    });
  }

  async executeDestroy(args: {
    vault: Address;
    authorization: FccAdminAuthorization;
  }): Promise<Hex> {
    return this.send(args.vault, vaultAbi, "destroyVault", [
      args.authorization.nonce,
      args.authorization.policyVersion,
      args.authorization.deadline,
      args.authorization.authorization,
    ]);
  }

  private async passkeyProof(
    vault: Address,
    amount: bigint,
    operation: VaultOperation,
    passkey?: PasskeyPolicy,
  ) {
    if (!passkey) return undefined;
    const state = await this.getState(vault);
    const to = operation === VaultOperation.Withdraw
      ? state.owner
      : "0x0000000000000000000000000000000000000000";
    return assertPasskey(
      passkey,
      computeStepUpChallenge({
        chainId: BigInt(await this.options.publicClient.getChainId()),
        vault,
        operation,
        to,
        amount,
        nonce: state.nonce,
        policyVersion: state.policyVersion,
      }),
    );
  }

  private async adminAuthorization(args: {
    vault: Address;
    state: PrivateVaultState;
    action: VaultAdminAction;
    payloadHash: Hex;
    passkey: PasskeyPolicy;
  }): Promise<FccAdminAuthorization> {
    const chainId = BigInt(await this.options.publicClient.getChainId());
    const proof = await assertPasskey(
      args.passkey,
      computeAdminChallenge({
        chainId,
        vault: args.vault,
        action: args.action,
        payloadHash: args.payloadHash,
        nonce: args.state.nonce,
        policyVersion: args.state.policyVersion,
      }),
    );
    return this.options.fcc.authorizeAdmin({
      vault: args.vault,
      action: args.action,
      payloadHash: args.payloadHash,
      stepUpProof: proof,
    });
  }

  private async sendAuthorization(
    vault: Address,
    functionName: string,
    prefix: readonly unknown[],
    authorization: FccAuthorization,
  ): Promise<Hex> {
    return this.send(vault, vaultAbi, functionName, [
      ...prefix,
      authorization.amountUsd,
      authorization.priceTimestamp,
      authorization.nonce,
      authorization.policyVersion,
      authorization.deadline,
      authorization.authorization,
    ]);
  }

  private async read(vault: Address, functionName: string): Promise<unknown> {
    return this.options.publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName,
      // Dynamic dispatch is contained at this ABI boundary.
    } as never);
  }

  private async policyPublicKey(vault: Address): Promise<string> {
    const tee = await this.read(vault, "tee") as Address;
    const teeRegistry = await this.options.publicClient.readContract({
      address: this.options.factory,
      abi: vaultFactoryAbi,
      functionName: "teeRegistry",
    });
    const registryAbi = [
      {
        type: "function",
        name: "getPublicKey",
        stateMutability: "view",
        inputs: [{ name: "_teeId", type: "address" }],
        outputs: [
          {
            name: "",
            type: "tuple",
            components: [
              { name: "x", type: "bytes32" },
              { name: "y", type: "bytes32" },
            ],
          },
        ],
      },
    ] as const;
    const key = await this.options.publicClient.readContract({
      address: teeRegistry,
      abi: registryAbi,
      functionName: "getPublicKey",
      args: [tee],
    });
    return toBase64Url(hexToBytes(concatHex(["0x04", key.x, key.y])));
  }

  private get account(): Account {
    if (!this.options.walletClient.account) throw new CovenantError("a connected wallet is required");
    return this.options.walletClient.account;
  }

  private get chain(): Chain | undefined {
    return this.options.walletClient.chain ?? undefined;
  }

  private async send(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]) {
    const { request } = await this.options.publicClient.simulateContract({
      address,
      abi,
      functionName,
      args,
      account: this.account,
      chain: this.chain,
    } as never);
    // viem's dynamic function union cannot be retained across this generic vault boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await this.options.walletClient.writeContract(request as any);
    const receipt = await this.options.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new CovenantError(`${functionName} reverted`);
    return hash;
  }
}

/** XRPL MemoData for FAssets direct mint: raw 32-byte hex, without `0x`. */
export function directMintMemo(vault: Address): string {
  return `464250526641001800000000${vault.slice(2).toLowerCase()}`;
}

export function directMintNetAmount(
  grossPaymentUba: bigint,
  feeBips: bigint,
  minimumFeeUba: bigint,
  executorFeeUba: bigint,
): bigint {
  if (grossPaymentUba <= minimumFeeUba + executorFeeUba) return 0n;
  let low = 0n;
  let high = grossPaymentUba - executorFeeUba;
  while (low < high) {
    const candidate = (low + high + 1n) / 2n;
    const proportional = (candidate * feeBips) / 10_000n;
    const fee = proportional > minimumFeeUba ? proportional : minimumFeeUba;
    if (candidate + fee + executorFeeUba <= grossPaymentUba) low = candidate;
    else high = candidate - 1n;
  }
  return low;
}

const xrplAlphabet = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

/** Validates an XRPL classic account address, including its Base58Check checksum. */
export function isValidXrplClassicAddress(value: string): boolean {
  if (value.length < 25 || value.length > 35 || value[0] !== "r") return false;
  let number = 0n;
  for (const character of value) {
    const digit = xrplAlphabet.indexOf(character);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }

  const numeric: number[] = [];
  while (number > 0n) {
    numeric.push(Number(number & 0xffn));
    number >>= 8n;
  }
  numeric.reverse();
  let leadingZeroes = 0;
  while (value[leadingZeroes] === xrplAlphabet[0]) leadingZeroes += 1;
  const decoded = new Uint8Array(leadingZeroes + numeric.length);
  decoded.set(numeric, leadingZeroes);
  if (decoded.length !== 25 || decoded[0] !== 0) return false;

  const checksum = sha256(sha256(decoded.subarray(0, 21))).subarray(0, 4);
  return checksum.every((byte, index) => byte === decoded[21 + index]);
}
