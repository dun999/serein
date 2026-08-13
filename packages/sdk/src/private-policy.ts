import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";

export interface PrivateRecipient {
  address: Address;
  label?: string;
}

export interface PasskeyPolicy {
  credentialId: string;
  publicKeySpki: string;
  rpId: string;
  origins: string[];
}

export interface PrivatePolicy {
  version: 1;
  name: string;
  perTxCapUsd: string;
  dailyCapUsd: string;
  stepUpThresholdUsd: string;
  allowedRecipients: PrivateRecipient[];
  webAuthn?: PasskeyPolicy;
}

export interface EncryptedPolicy {
  commitment: Hex;
  ciphertext: Hex;
  plaintext: string;
}

export interface PasskeyProof {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

export enum VaultOperation {
  Spend = 0,
  Withdraw = 1,
  Redeem = 2,
}

export enum VaultAdminAction {
  PolicyUpdate = 0,
  Destroy = 1,
  TeeUpdate = 2,
  GuardianUpdate = 3,
  XrplPayoutUpdate = 4,
}

const textEncoder = new TextEncoder();

export function serializePolicy(policy: PrivatePolicy): string {
  const normalized: PrivatePolicy = {
    version: 1,
    name: policy.name.trim(),
    perTxCapUsd: normalizeUint(policy.perTxCapUsd, "perTxCapUsd"),
    dailyCapUsd: normalizeUint(policy.dailyCapUsd, "dailyCapUsd"),
    stepUpThresholdUsd: normalizeUint(policy.stepUpThresholdUsd, "stepUpThresholdUsd"),
    allowedRecipients: [...policy.allowedRecipients]
      .map((recipient) => ({
        address: recipient.address.toLowerCase() as Address,
        ...(recipient.label?.trim() ? { label: recipient.label.trim() } : {}),
      }))
      .sort((a, b) => a.address.localeCompare(b.address)),
    ...(policy.webAuthn
      ? {
          webAuthn: {
            credentialId: policy.webAuthn.credentialId,
            publicKeySpki: policy.webAuthn.publicKeySpki,
            rpId: policy.webAuthn.rpId,
            origins: [...policy.webAuthn.origins].sort(),
          },
        }
      : {}),
  };

  const perTx = BigInt(normalized.perTxCapUsd);
  const daily = BigInt(normalized.dailyCapUsd);
  if (perTx === 0n || daily === 0n || perTx > daily) {
    throw new Error("private policy requires 0 < per-transaction cap <= daily cap");
  }
  return JSON.stringify(normalized);
}

export async function encryptPolicy(args: {
  policy: PrivatePolicy;
  policyPublicKey: string;
  chainId: bigint;
  vault: Address;
  policyVersion: bigint;
}): Promise<EncryptedPolicy> {
  const plaintext = serializePolicy(args.policy);
  const plaintextBytes = textEncoder.encode(plaintext);
  const receiverPublic = fromBase64Url(args.policyPublicKey);
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4) {
    throw new Error("FCC policy public key must be an uncompressed secp256k1 key");
  }

  // This is go-ethereum ECIES (AES-128-CTR + HMAC-SHA256), the exact format
  // tee-node's loopback /decrypt endpoint accepts. The private key is the
  // registered machine identity and never enters this application process.
  const payload = concat(policyBinding(args), plaintextBytes);
  const envelope = await encryptForTee(receiverPublic, payload);
  return {
    commitment: keccak256(toHex(plaintextBytes)),
    ciphertext: toHex(envelope),
    plaintext,
  };
}

export function computeStepUpChallenge(args: {
  chainId: bigint;
  vault: Address;
  operation: VaultOperation;
  to: Address;
  amount: bigint;
  nonce: bigint;
  policyVersion: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint64" },
      ],
      [
        "COVENANT_STEP_UP_V1",
        args.chainId,
        args.vault,
        args.operation,
        args.to,
        args.amount,
        args.nonce,
        args.policyVersion,
      ],
    ),
  );
}

export function computeAdminChallenge(args: {
  chainId: bigint;
  vault: Address;
  action: VaultAdminAction;
  payloadHash: Hex;
  nonce: bigint;
  policyVersion: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint64" },
      ],
      [
        "COVENANT_ADMIN_STEP_UP_V1",
        args.chainId,
        args.vault,
        args.action,
        args.payloadHash,
        args.nonce,
        args.policyVersion,
      ],
    ),
  );
}

export function policyPayloadHash(commitment: Hex, ciphertext: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [commitment, keccak256(ciphertext)],
    ),
  );
}

export function addressPayloadHash(address: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }], [address]));
}

export async function registerPasskey(args: {
  name: string;
  userId: Uint8Array;
  userName: string;
  rpId: string;
  rpName?: string;
  origin?: string;
}): Promise<PasskeyPolicy> {
  if (!globalThis.PublicKeyCredential || !navigator.credentials) {
    throw new Error("this browser does not support passkeys");
  }
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: args.rpId, name: args.rpName ?? "Covenant" },
      user: { id: asArrayBuffer(args.userId), name: args.userName, displayName: args.name },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }],
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
      attestation: "none",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("passkey registration was cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey?.();
  if (!publicKey) throw new Error("browser did not expose the passkey public key");
  return {
    credentialId: toBase64Url(new Uint8Array(credential.rawId)),
    publicKeySpki: toBase64Url(new Uint8Array(publicKey)),
    rpId: args.rpId,
    origins: [args.origin ?? globalThis.location.origin],
  };
}

export async function assertPasskey(
  credential: PasskeyPolicy,
  challenge: Hex,
): Promise<PasskeyProof> {
  assertPasskeyContext(credential);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: asArrayBuffer(toBytes(challenge)),
      rpId: credential.rpId,
      // Do not pin allowCredentials here. A discoverable request lets Google
      // Password Manager or another passkey provider offer a synced credential
      // on a new device. FCC still verifies the returned credential ID and
      // signature against the encrypted policy, so this changes discovery,
      // not authorization.
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("passkey confirmation was cancelled");
  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: toBase64Url(new Uint8Array(assertion.rawId)),
    authenticatorData: toBase64Url(new Uint8Array(response.authenticatorData)),
    clientDataJSON: toBase64Url(new Uint8Array(response.clientDataJSON)),
    signature: toBase64Url(new Uint8Array(response.signature)),
  };
}

export function passkeyContextIssue(
  credential: PasskeyPolicy,
  locationLike: Pick<Location, "hostname" | "origin"> = globalThis.location,
): string | null {
  const hostname = locationLike.hostname.toLowerCase();
  const rpId = credential.rpId.toLowerCase();
  const hostMatches = hostname === rpId || hostname.endsWith(`.${rpId}`);
  if (!hostMatches) {
    return `This passkey belongs to ${credential.rpId}, but this app is running on ${locationLike.hostname}. Open the original hostname or enroll a new vault passkey on this hostname.`;
  }
  if (!credential.origins.includes(locationLike.origin)) {
    return `This policy allows ${credential.origins.join(", ")}, but the current origin is ${locationLike.origin}. Use the exact original URL, including http/https and port.`;
  }
  return null;
}

function assertPasskeyContext(credential: PasskeyPolicy): void {
  const issue = passkeyContextIssue(credential);
  if (issue) throw new Error(issue);
}

export function encodePasskeyProof(proof?: PasskeyProof): Hex {
  return proof ? stringToHex(JSON.stringify(proof)) : "0x";
}

function policyBinding(args: {
  chainId: bigint;
  vault: Address;
  policyVersion: bigint;
}): Uint8Array {
  return concat(
    textEncoder.encode("COVENANT_POLICY_V1"),
    uint64(args.chainId),
    toBytes(args.vault),
    uint64(args.policyVersion),
  );
}

async function encryptForTee(receiverPublic: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const ephemeral = secp256k1.keygen();
  const ephemeralPublic = secp256k1.getPublicKey(ephemeral.secretKey, false);
  const sharedPoint = secp256k1.getSharedSecret(ephemeral.secretKey, receiverPublic, false);
  const sharedX = sharedPoint.subarray(1, 33);

  // geth's concatKDF needs 32 bytes here, so it is exactly one SHA-256 block.
  const material = sha256(concat(new Uint8Array([0, 0, 0, 1]), sharedX));
  const encryptionKey = material.subarray(0, 16);
  const macKey = sha256(material.subarray(16, 32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", asArrayBuffer(encryptionKey), "AES-CTR", false, ["encrypt"]);
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CTR", counter: asArrayBuffer(iv), length: 128 },
      key,
      asArrayBuffer(plaintext),
    ),
  );
  const encryptedMessage = concat(iv, body);
  const tag = hmac(sha256, macKey, encryptedMessage);
  return concat(ephemeralPublic, encryptedMessage, tag);
}

function uint64(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error("value does not fit uint64");
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, false);
  return bytes;
}

function normalizeUint(value: string, field: string): string {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be an unsigned integer string`);
  return BigInt(value).toString();
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

export function toBase64Url(bytes: Uint8Array): string {
  let base64: string;
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    base64 = globalThis.btoa(binary);
  } else if (typeof Buffer !== "undefined") {
    // Some browser bundles expose a Buffer polyfill that supports `base64`
    // but not Node's newer `base64url` encoding name. Normalize it ourselves.
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    throw new Error("Base64 encoding is unavailable");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  throw new Error("Base64 decoding is unavailable");
}
