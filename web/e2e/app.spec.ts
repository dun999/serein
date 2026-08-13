import { expect, test, type Page, type Route } from "@playwright/test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  stringToHex,
  toFunctionSelector,
} from "viem";

import { instructionSenderAbi, vaultAbi, vaultFactoryAbi } from "@covenant/sdk";

const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const VAULT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const RECIPIENT = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
const INSTRUCTION_SENDER = "0x2222222222222222222222222222222222222222" as const;
const TEE = "0x7777777777777777777777777777777777777777" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const INSTRUCTION_ID = `0x${"9".repeat(64)}` as const;
const INSTRUCTION_TX = `0x${"a".repeat(64)}` as const;
const EXECUTION_TX = `0x${"b".repeat(64)}` as const;
const BLOCK_HASH = `0x${"d".repeat(64)}` as const;

test("landing page is usable on a narrow screen and exposes deployment health", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Private rules for programmable XRP." })).toBeVisible();
  await expect(page.getByRole("link", { name: /deployment/i }).last()).toHaveAttribute("href", "/api/status");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("wallet errors and wrong-network recovery are explicit", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Connect" }).last().click();
  await expect(page.getByText("No Ethereum wallet found")).toBeVisible();

  await injectWallet(page, "0x1");
  await page.reload();
  await expect(page.getByText("Wrong network")).toBeVisible();
  await page.getByRole("button", { name: "Switch to Coston2" }).click();
  await expect(page.getByText("Create a private XRP vault", { exact: true })).toBeVisible();
});

test("an FCC refusal preserves instruction evidence and sends no vault execution", async ({ page }) => {
  await installVaultScenario(page, "refused");
  await page.goto("/app/pay");
  await expect(page.getByText("Pay from the vault", { exact: true })).toBeVisible();
  await page.getByLabel("Recipient", { exact: true }).fill(RECIPIENT);
  await page.getByLabel("Amount", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Request private authorization" }).click();

  await expect(page.getByText("Private policy refused")).toBeVisible();
  await expect(page.getByText("No execution transaction was submitted")).toBeVisible();
  expect(await sentTransactionCount(page)).toBe(1);
});

test("an approved payment shows the FCC-to-vault evidence timeline", async ({ page }) => {
  await installVaultScenario(page, "approved");
  await page.goto("/app/pay");
  await expect(page.getByText("Pay from the vault", { exact: true })).toBeVisible();
  await page.getByLabel("Recipient", { exact: true }).fill(RECIPIENT);
  await page.getByLabel("Amount", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Request private authorization" }).click();

  await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  await expect(page.getByText("FCC instruction", { exact: true })).toBeVisible();
  await expect(page.getByText("Private policy decision", { exact: true })).toBeVisible();
  await expect(page.getByText("Vault execution", { exact: true })).toBeVisible();
  expect(await sentTransactionCount(page)).toBe(2);
});

test("vault destruction requires passkey confirmation before the terminal transaction", async ({ page }) => {
  await installVaultScenario(page, "admin");
  await page.goto("/app/cash-out");
  await page.getByRole("button", { name: "Destroy vault", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Permanently destroy this vault?" })).toBeVisible();
  await page.getByRole("button", { name: "Verify and destroy" }).click();

  await expect(page.getByText("Passkey verified. The vault is permanently closed", { exact: false })).toBeVisible();
  expect(await sentTransactionCount(page)).toBe(2);
});

async function installVaultScenario(page: Page, decision: "approved" | "refused" | "admin") {
  await injectWallet(page, "0x72");
  await page.addInitScript(({ vault, recipient, withPasskey }) => {
    localStorage.setItem(`covenant:private-policy:${vault}`, JSON.stringify({
      version: 1,
      name: "Browser acceptance",
      perTxCapUsd: "5000000000",
      dailyCapUsd: "10000000000",
      stepUpThresholdUsd: "2000000000",
      allowedRecipients: [{ address: recipient, label: "Approved" }],
      ...(withPasskey
        ? {
            webAuthn: {
              credentialId: "AQID",
              publicKeySpki: "BAUG",
              rpId: window.location.hostname,
              origins: [window.location.origin],
            },
          }
        : {}),
    }));
    if (withPasskey) {
      Object.defineProperty(navigator, "credentials", {
        configurable: true,
        value: {
          get: async ({ publicKey }: { publicKey: { challenge: ArrayBuffer } }) => ({
            rawId: Uint8Array.from([1, 2, 3]).buffer,
            response: {
              authenticatorData: new Uint8Array(37).buffer,
              clientDataJSON: new TextEncoder().encode(JSON.stringify({
                type: "webauthn.get",
                challenge: Array.from(new Uint8Array(publicKey.challenge)).join(","),
                origin: window.location.origin,
              })).buffer,
              signature: Uint8Array.from([4, 5, 6]).buffer,
            },
          }),
        },
      });
    }
  }, { vault: VAULT, recipient: RECIPIENT, withPasskey: decision === "admin" });
  await page.route("https://coston2-api.flare.network/**", mockRpc);
  await page.route("https://fcc.test/action/result/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(decision === "refused"
        ? { result: { status: 0, log: "recipient is not approved" } }
        : {
            result: {
              status: 1,
              data: decision === "admin" ? {
                tee: TEE,
                authorization: `0x${"1".repeat(130)}`,
                digest: `0x${"e".repeat(64)}`,
                nonce: "0",
                deadline: "4102444800",
                policyVersion: "1",
                adminAction: 1,
                payloadHash: `0x${"7".repeat(64)}`,
              } : {
                tee: TEE,
                authorization: `0x${"1".repeat(130)}`,
                digest: `0x${"e".repeat(64)}`,
                nonce: "0",
                deadline: "4102444800",
                amountUsd: "100000000",
                priceTimestamp: "1700000000",
                policyVersion: "1",
                operation: 0,
              },
            },
          }),
    });
  });
}

async function injectWallet(page: Page, initialChainId: string) {
  await page.addInitScript(({ owner, chainId, instructionTx, executionTx }) => {
    let currentChainId = chainId;
    let sent = 0;
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: async ({ method }: { method: string }) => {
          if (method === "eth_accounts" || method === "eth_requestAccounts") return [owner];
          if (method === "eth_chainId") return currentChainId;
          if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
            currentChainId = "0x72";
            return null;
          }
          if (method === "eth_sendTransaction") {
            sent += 1;
            return sent === 1 ? instructionTx : executionTx;
          }
          if (method === "wallet_revokePermissions") return null;
          throw new Error(`Unexpected wallet method: ${method}`);
        },
        on: () => undefined,
        removeListener: () => undefined,
        sentTransactionCount: () => sent,
      },
    });
  }, { owner: OWNER, chainId: initialChainId, instructionTx: INSTRUCTION_TX, executionTx: EXECUTION_TX });
}

async function sentTransactionCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as {
    ethereum: { sentTransactionCount: () => number };
  }).ethereum.sentTransactionCount());
}

async function mockRpc(route: Route) {
  const request = route.request();
  const body = request.postDataJSON() as { id: number; method: string; params?: unknown[] };
  let result: unknown;
  switch (body.method) {
    case "eth_chainId": result = "0x72"; break;
    case "eth_blockNumber": result = "0x10"; break;
    case "eth_getCode": result = "0x6000"; break;
    case "eth_getTransactionReceipt": {
      const hash = (body.params?.[0] as string).toLowerCase();
      result = receipt(hash === INSTRUCTION_TX ? INSTRUCTION_TX : EXECUTION_TX, hash === INSTRUCTION_TX);
      break;
    }
    case "eth_call": result = ethCall(body.params?.[0] as { to: string; data: `0x${string}` }); break;
    default: result = null;
  }
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jsonrpc: "2.0", id: body.id, result }) });
}

function ethCall(call: { to: string; data: `0x${string}` }): `0x${string}` {
  const selector = call.data.slice(0, 10);
  if (selector === toFunctionSelector("vaultsOf(address)")) {
    return encodeFunctionResult({ abi: vaultFactoryAbi, functionName: "vaultsOf", result: [VAULT] });
  }
  if (selector === toFunctionSelector("balanceOf(address)")) {
    return encodeAbiParameters([{ type: "uint256" }], [10_000_000n]);
  }
  if (selector === toFunctionSelector("requestSpend(address,address,uint256,bytes)")) {
    return encodeFunctionResult({ abi: instructionSenderAbi, functionName: "requestSpend", result: INSTRUCTION_ID });
  }
  if (selector === toFunctionSelector("requestAdmin(address,uint8,bytes32,bytes)")) {
    return encodeFunctionResult({ abi: instructionSenderAbi, functionName: "requestAdmin", result: INSTRUCTION_ID });
  }
  if (selector === toFunctionSelector("owner()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "owner", result: OWNER });
  if (selector === toFunctionSelector("guardian()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "guardian", result: ZERO });
  if (selector === toFunctionSelector("tee()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "tee", result: TEE });
  if (selector === toFunctionSelector("status()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "status", result: 0 });
  if (selector === toFunctionSelector("balance()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "balance", result: 5_000_000n });
  if (selector === toFunctionSelector("nonce()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "nonce", result: 0n });
  if (selector === toFunctionSelector("policyCommitment()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "policyCommitment", result: `0x${"f".repeat(64)}` });
  if (selector === toFunctionSelector("policyVersion()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "policyVersion", result: 1n });
  if (selector === toFunctionSelector("xrplPayout()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "xrplPayout", result: "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY" });
  if (selector === toFunctionSelector("timelockSeconds()")) return encodeFunctionResult({ abi: vaultAbi, functionName: "timelockSeconds", result: 86_400 });
  if (selector === toFunctionSelector("quote(uint256)")) return encodeFunctionResult({ abi: vaultAbi, functionName: "quote", result: [100_000_000n, 1_700_000_000n] });
  if (selector === toFunctionSelector("minimumRedeemAmountUBA()")) {
    return encodeAbiParameters([{ type: "uint256" }], [5_000_000n]);
  }
  if (selector === toFunctionSelector("spend(address,uint256,uint256,uint64,uint256,uint64,uint64,bytes)")) return "0x";
  if (selector === toFunctionSelector("destroyVault(uint256,uint64,uint64,bytes)")) {
    return encodeFunctionResult({ abi: vaultAbi, functionName: "destroyVault", result: 5_000_000n });
  }
  throw new Error(`Unhandled eth_call selector ${selector} to ${call.to}`);
}

function receipt(hash: `0x${string}`, withInstructionLog: boolean) {
  const topics = encodeEventTopics({
    abi: instructionSenderAbi,
    eventName: "AuthorizationRequested",
    args: { instructionId: INSTRUCTION_ID, vault: VAULT, requester: OWNER },
  });
  const log = {
    address: INSTRUCTION_SENDER,
    blockHash: BLOCK_HASH,
    blockNumber: "0x10",
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [stringToHex("AUTHORIZE_SPEND", { size: 32 }), RECIPIENT, 1_000_000n],
    ),
    logIndex: "0x0",
    removed: false,
    topics,
    transactionHash: hash,
    transactionIndex: "0x0",
  };
  return {
    blockHash: BLOCK_HASH,
    blockNumber: "0x10",
    contractAddress: null,
    cumulativeGasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    from: OWNER,
    gasUsed: "0x5208",
    logs: withInstructionLog ? [log] : [],
    logsBloom: `0x${"0".repeat(512)}`,
    status: "0x1",
    to: withInstructionLog ? INSTRUCTION_SENDER : VAULT,
    transactionHash: hash,
    transactionIndex: "0x0",
    type: "0x2",
  };
}
