# Contracts and addresses

Live on **Flare Coston2** (chain ID 114). Browse any of these on the [Coston2 explorer](https://coston2-explorer.flare.network).

## Serein's own contracts

| What | Address |
| --- | --- |
| Vault factory | `0xd0Ed02fF17f00144CB1693F95a4D77a307f7649f` |
| FCC instruction sender | `0x468a86Dd6B18Fd5871fFBBdc05FF48635156A962` |
| FCC machine (signing key) | `0x8055259F650c8E4cF6753BDA05E4093b604Bfc0E` |

The FCC machine is a signing address, not a contract — it is the identity your vault checks every authorization against.

An earlier factory at `0x6a91918f35b60039Dd034005F984e4a2152eE060` is still recognised so older vaults remain reachable. The app marks those vaults and offers to close them.

## Flare systems

| What | Address |
| --- | --- |
| FXRP (`FTestXRP`, 6 decimals) | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| FAssets AssetManager | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |
| FTSOv2 | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` |
| TEE machine registry | `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE` |

FCC extension ID: `0x…1029e` (66206).

## Checking it yourself

The live deployment publishes its own health at [serein.finance/api/status](https://serein.finance/api/status), which verifies each address has code, the FCC machine is registered as `Production`, and it is the only active machine for this extension.

To check by hand:

```bash
export RPC=https://coston2-api.flare.network/ext/C/rpc
REG=0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE
TEE=0x8055259F650c8E4cF6753BDA05E4093b604Bfc0E

cast call $REG 'getTeeMachineStatus(address)(uint8)' $TEE --rpc-url $RPC   # 2 = Production
cast call $REG 'getExtensionId(address)(uint256)'   $TEE --rpc-url $RPC   # 66206
```

## The vault contract

Each vault is a separate deployment. Worth knowing:

**Enforced on every value movement:** rules are initialised; amount is non-zero and within balance; the deadline has not passed; the counter matches; the rule version matches; the machine is registered, `Production`, and running this extension; the price is fresh and within 1% of the signed value; the signature recovers to the vault's assigned machine.

**Timelocked (1–30 days, 24 hours by default):** rule changes, guardian changes, machine changes, the XRP Ledger payout address, unlocking, and recovery.

**Statuses:** `ACTIVE`, `LOCKED`, `DESTROYED`.

Source: [`contracts/src/CovenantVault.sol`](https://github.com/dun999/serein/blob/main/contracts/src/CovenantVault.sol).

## Networks

| | |
| --- | --- |
| Flare Coston2 | chain ID 114 · `https://coston2-api.flare.network/ext/C/rpc` |
| XRP Ledger | Testnet |

These are test networks. The coins are not real.
