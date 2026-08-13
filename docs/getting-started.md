# Getting started

Everything here runs on test networks, so you can try it without risking real money.

## What you need

**A Flare Coston2 wallet.** MetaMask or any EVM wallet works. Add the Coston2 network and get free test C2FLR from the [Coston2 faucet](https://faucet.flare.network/coston2) to pay for gas.

**A passkey.** This is the fingerprint, face, or PIN check on your device. Serein uses it for the actions that matter most. It works through your device, your browser, or a password manager. You do not create anything separately — Serein enrols one for you when you open the vault.

**Some test XRP, if you want to mint your own FXRP.** You need the [Xaman wallet](https://xaman.app) on your phone set to Testnet, plus test XRP from the [XRPL Testnet faucet](https://xrpl.org/xrp-testnet-faucet.html). You can skip this if you already hold FXRP on Coston2.

## A word about passkeys

A passkey is tied to the exact website address where it was created. A passkey made on `serein.finance` will not work on `localhost`, and vice versa — the browser treats them as different sites.

So: **create your vault on the address you plan to keep using**, and sign in to the same password manager or account later. If you enrol a passkey and then cannot produce it, the actions that require it are not available to you.

## The five-minute version

1. Go to [serein.finance](https://serein.finance) and connect your wallet.
2. Open a vault. Fill in your XRP Ledger address, the addresses you want to be able to pay, and your limits. Confirm the passkey prompt.
3. Put some FXRP in — either transfer FXRP you already hold, or mint fresh FXRP by sending test XRP from Xaman.
4. Send a payment to one of your approved addresses.
5. Take it back out with a withdrawal.

Each of those has its own page with the details:

- [Create a vault](guides/create-a-vault.md)
- [Add money](guides/add-money.md)
- [Make a payment](guides/make-a-payment.md)
- [Get money out](guides/get-money-out.md)

## Things that will look odd at first

**Two transactions for one payment.** The first asks permission, the second spends it. This is the design, not a bug. See [How Serein works](how-serein-works.md).

**A small fee on the first transaction.** Asking for permission is an on-chain message, so it costs a little gas. You pay it even if the answer is no — the check really happened.

**Minting takes a few minutes.** After you approve the XRP payment in Xaman, the FXRP does not appear instantly. Proof of your payment has to be verified before the FXRP is issued. The app shows a running timer, and you can close the page — it carries on without you.

**Locking is not instant to undo.** If you lock the vault, reopening it takes a waiting period (24 hours by default). That delay is what makes locking useful in an emergency, but it means you should not lock it just to have a look.
