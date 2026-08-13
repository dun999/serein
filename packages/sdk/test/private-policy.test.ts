import { secp256k1 } from "@noble/curves/secp256k1.js";
import { describe, expect, it, vi } from "vitest";

import {
  VaultAdminAction,
  VaultOperation,
  assertPasskey,
  computeAdminChallenge,
  computeStepUpChallenge,
  decodeResultData,
  directMintMemo,
  directMintNetAmount,
  encryptPolicy,
  fromBase64Url,
  isValidXrplClassicAddress,
  passkeyContextIssue,
  serializePolicy,
  toBase64Url,
  type PrivatePolicy,
} from "../src/index.js";

const merchant = "0x00000000000000000000000000000000000000b0" as const;
const vault = "0x000000000000000000000000000000000000c0de" as const;

const policy: PrivatePolicy = {
  version: 1,
  name: "Operations",
  perTxCapUsd: "5000000000",
  dailyCapUsd: "10000000000",
  stepUpThresholdUsd: "2500000000",
  allowedRecipients: [{ address: merchant, label: "Merchant" }],
};

describe("private policy", () => {
  it("serializes the same policy deterministically", () => {
    expect(serializePolicy(policy)).toBe(serializePolicy({ ...policy }));
    expect(serializePolicy(policy)).toContain('"perTxCapUsd":"5000000000"');
  });

  it("encrypts to the registered TEE's go-ethereum ECIES envelope", async () => {
    const receiver = secp256k1.keygen();
    const encrypted = await encryptPolicy({
      policy,
      policyPublicKey: toBase64Url(secp256k1.getPublicKey(receiver.secretKey, false)),
      chainId: 114n,
      vault,
      policyVersion: 1n,
    });

    expect(encrypted.ciphertext.startsWith("0x04")).toBe(true);
    expect((encrypted.ciphertext.length - 2) / 2 - encrypted.plaintext.length).toBeGreaterThan(113);
    expect(encrypted.commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("binds passkey challenges to the exact operation", () => {
    const common = { chainId: 114n, vault, to: merchant, amount: 1_000_000n, nonce: 3n, policyVersion: 2n };
    const spend = computeStepUpChallenge({ ...common, operation: VaultOperation.Spend });
    const withdraw = computeStepUpChallenge({ ...common, operation: VaultOperation.Withdraw });
    expect(spend).not.toBe(withdraw);
  });

  it("matches the FCC admin passkey fixture and binds the action", () => {
    const common = {
      chainId: 114n,
      vault,
      payloadHash: `0x${"1".repeat(64)}` as const,
      nonce: 7n,
      policyVersion: 3n,
    };
    const policyUpdate = computeAdminChallenge({
      ...common,
      action: VaultAdminAction.PolicyUpdate,
    });
    const destroy = computeAdminChallenge({ ...common, action: VaultAdminAction.Destroy });
    expect(policyUpdate).toBe("0xd1f66074d5e4293a2bbc94490a47922630a780187747b6fdb39123df70178925");
    expect(destroy).not.toBe(policyUpdate);
  });

  it("uses discoverable assertions so synced passkeys work on another device", async () => {
    const credential = {
      credentialId: "AQID",
      publicKeySpki: "BAUG",
      rpId: "serein.finance",
      origins: ["https://serein.finance"],
    };
    let request: CredentialRequestOptions | undefined;
    vi.stubGlobal("location", { hostname: "serein.finance", origin: "https://serein.finance" });
    vi.stubGlobal("navigator", {
      credentials: {
        get: async (options: CredentialRequestOptions) => {
          request = options;
          return {
            rawId: Uint8Array.from([1, 2, 3]).buffer,
            response: {
              authenticatorData: new Uint8Array(37).buffer,
              clientDataJSON: new TextEncoder().encode("{}").buffer,
              signature: Uint8Array.from([4, 5, 6]).buffer,
            },
          };
        },
      },
    });
    try {
      const proof = await assertPasskey(credential, `0x${"1".repeat(64)}` as const);
      expect(request?.publicKey?.allowCredentials).toBeUndefined();
      expect(proof.credentialId).toBe("AQID");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("explains hostname and origin mismatches before opening a passkey prompt", () => {
    const credential = {
      credentialId: "AQID",
      publicKeySpki: "BAUG",
      rpId: "localhost",
      origins: ["http://localhost:3000"],
    };
    expect(passkeyContextIssue(credential, {
      hostname: "serein.finance",
      origin: "https://serein.finance",
    })).toContain("belongs to localhost");
    expect(passkeyContextIssue(credential, {
      hostname: "localhost",
      origin: "http://localhost:3001",
    })).toContain("exact original URL");
  });

  it("supports browser Buffer polyfills without the base64url encoding name", () => {
    const nativeBuffer = globalThis.Buffer;
    const polyfill = {
      from(value: Uint8Array | string, encoding?: BufferEncoding) {
        if (encoding === "base64url") throw new Error("Unknown encoding: base64url");
        const result = nativeBuffer.from(value as never, encoding);
        const nativeToString = result.toString.bind(result);
        result.toString = ((requested?: BufferEncoding) => {
          if (requested === "base64url") throw new Error("Unknown encoding: base64url");
          return nativeToString(requested);
        }) as typeof result.toString;
        return result;
      },
    };

    vi.stubGlobal("btoa", undefined);
    vi.stubGlobal("atob", undefined);
    vi.stubGlobal("Buffer", polyfill);
    try {
      const bytes = Uint8Array.from([0xfb, 0xff, 0x00, 0x01]);
      const encoded = toBase64Url(bytes);
      expect(encoded).toBe("-_8AAQ");
      expect(fromBase64Url(encoded)).toEqual(bytes);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("builds the official 32-byte direct-mint memo", () => {
    const memo = directMintMemo(vault);
    expect(memo).toBe("464250526641001800000000000000000000000000000000000000000000c0de");
    expect(memo.length / 2).toBe(32);
  });

  it("calculates direct-mint net amount after minimum and executor fees", () => {
    expect(directMintNetAmount(10_000_000n, 20n, 100_000n, 50_000n)).toBe(9_850_000n);
    expect(directMintNetAmount(150_000n, 20n, 100_000n, 50_000n)).toBe(0n);
  });

  it("validates XRPL classic-address checksums", () => {
    expect(isValidXrplClassicAddress("rKGAv7Z5LEf7vrdSGteLK46kC1wiqp1Z7N")).toBe(true);
    expect(isValidXrplClassicAddress("rKGAv7Z5LEf7vrdSGteLK46kC1wiqp1Z7M")).toBe(false);
    expect(isValidXrplClassicAddress("not-an-xrpl-address")).toBe(false);
  });

  it("decodes the hexutil bytes returned by tee-node", () => {
    const json = '{"tee":"0x00000000000000000000000000000000000000aa","nonce":"7"}';
    const hex = `0x${Buffer.from(json).toString("hex")}`;
    expect(decodeResultData(hex)).toEqual({
      tee: "0x00000000000000000000000000000000000000aa",
      nonce: "7",
    });
  });
});
