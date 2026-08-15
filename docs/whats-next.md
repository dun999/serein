# What's next?

Serein is built in stages. On the test network today it already holds FXRP, checks every payment against private rules, and sends money back to XRP. The next stage is about two things: who can use a vault, and what a vault can do with the money inside it — AI agents, machine payments, and Flare's growing DeFi layer.

## A smart wallet for AI agents

Today a vault answers to its owner. The next step is letting the owner give an agent a key of its own, with rules of its own:

* the agent key can request payments and deposits, but only within limits the owner set;
* the agent has its own per-payment and daily limits;
* and its own approved recipients, so a compromised agent cannot send money somewhere new.

The agent key lives inside the encrypted policy, exactly like the passkey does today. Nobody can read it off the chain, and it cannot be swapped without the owner's passkey and the waiting period. The two-approval rule still applies: an agent can ask, but money only moves when the checker agrees too.

## Micropayments with x402 and MPP

Machines pay for things: API calls, data, compute, model usage. The web already has a standard shape for that — the HTTP 402 status. Two protocols build on it: x402, created by Coinbase, and MPP, the newer Machine Payments Protocol from Tempo and Stripe. Both let a server say "pay this amount to this address" and let a wallet answer automatically, without accounts or API keys.

Flare already supports the token side of this. Stablecoins on Flare accept EIP-3009 signed transfers, which is the payment credential these protocols use — the payer signs and the server settles, so the payer needs no gas. x402 services are already settling on Flare today.

A Serein vault fits in as the payer. The vault holds the stablecoins, and the owner's rules still apply: small machine payments can flow automatically, payments above the threshold need the passkey, and the daily limit always holds. The vault verifies the payment signature itself, so nobody can spend from it without the rules being checked.

## Direct deposits into DeFi

Morpho, the modular lending protocol, is live on Flare with markets built around FXRP. It is the first lending layer where Serein's "deposit straight from the vault" idea has a concrete target.

The plan: instead of only paying an address, a vault can deposit directly into a lending market. The money stays in the vault's name — it is a position, not a payment, so it does not count against the daily spending limit. The checker approves only known, vetted protocols, so a hacked website cannot point the vault at a contract that can take everything. And because the position belongs to the vault, it can be pulled back: recovery still returns the whole balance to your XRP Ledger address.

## The flow

```
XRP → vault → DeFi (Morpho and others) → back to XRP
```

Deposit from XRP into the vault, put the vault's FXRP to work in lending, earn, and cash out through the same vault when you choose. Every step on the way out is still checked against the encrypted rules.

## What does not change

These are additions, not replacements:

* **Two approvals.** The wallet and the checker both have to agree, whether the mover is a person, an agent, or a DeFi deposit.
* **Encrypted rules.** Agent keys, recipient lists, and limits stay unreadable on-chain.
* **Recovery.** The escape hatch still works even if the checker or the agent is gone.
* **Passkeys.** Anything important still needs the enrolled passkey.

## Being honest about the timeline

This page is a roadmap, not a list of shipped features. The pieces are being built one at a time, test network first, and each one is verified the same way the current vault was. What is true today is what the rest of these docs describe: private rules, enforced and encrypted, on Flare Coston2.

Next: read [How Serein works](how-serein-works.md) for the design that all of this builds on.
