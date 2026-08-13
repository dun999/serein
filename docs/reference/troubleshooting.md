# Troubleshooting

## My payment was refused

A refusal means the rules worked. The message names the rule:

- **Recipient not approved** — add the address on the Rules page.
- **Per-payment limit exceeded** — split the payment, or raise the limit.
- **Daily limit exceeded** — wait for the next day, or raise the limit.
- **Passkey verification refused** — see the passkey section below.

Refusals cost the gas for the request transaction. The check genuinely ran.

## "Vault state changed while this action was pending"

Your permission slip went stale. They last five minutes and are tied to the vault's counter and the current price.

Request a fresh one. If it keeps happening, you are probably running two actions at once — finish one before starting the next.

## The FXRP from my mint has not arrived

Normal for the first few minutes. Your XRP payment has to be proven to Flare before FXRP is issued.

Check in order:

1. Open the XRP Ledger transaction from the progress card. Did it succeed?
2. Was Xaman on **Testnet**? A Mainnet payment will never mint here.
3. **Which vault did you mint to?** The memo names one specific vault. If you own more than one, check the overview page — the FXRP may have arrived in a different vault than the one you are looking at.

You can close the page. The mint continues, and the progress card comes back with a timer when you return.

## "Direct mint recipient is not a Serein vault"

You are on an older vault from a previous version. Minting is only offered for current vaults.

Switch to a current vault on the overview page, or close the old one to move its balance to your wallet, then create a new one.

## My passkey does not work

Passkeys are tied to the exact site address where they were created. A passkey from `localhost` will not work on `serein.finance`.

Check:

- You are on the same address where you created the vault.
- You are signed in to the same password manager or account.
- Passkey syncing is on, if you have switched devices.

Serein also keeps passkey details in your browser. **Clearing browser data can remove them.** A synced password manager avoids this.

If the passkey is gone for good, actions above your threshold and all cash-outs are unavailable. Your remaining route is [recovery](../guides/lock-and-recovery.md), which sends everything to your saved XRP Ledger address after the delay.

## I locked my vault and cannot unlock it

Unlocking has a waiting period, 24 hours by default.

On the Cash out page press **Start unlock** — that begins the countdown, and the page shows the time remaining. Come back when it reaches zero and press **Confirm unlock**.

Start the countdown as soon as you decide to unlock; nothing happens until you do.

## "Nothing is scheduled yet"

You tried to execute something whose countdown never started. Recovery has to be **scheduled** first, then waited out, then executed.

The buttons now enable themselves only when the contract would actually accept them, so this should be rare.

## FCC did not return a decision

The confidential service did not answer in time. Check [serein.finance/api/status](https://serein.finance/api/status) — it reports whether the FCC proxy and machine are healthy.

No vault execution was submitted, so nothing moved. Retry once the status page is clean.

## The whole balance could not be redeemed

FAssets redeems in whole lots, and a leftover smaller than one lot cannot go out that way.

Withdraw the remainder to your Flare wallet instead — withdrawals have no lot minimum.

## Wrong network

Serein is on Flare Coston2 (chain ID 114). Switch your wallet. For minting, Xaman must be on XRPL **Testnet**.
