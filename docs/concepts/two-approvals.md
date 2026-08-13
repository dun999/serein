# Two approvals

The rule at the centre of Serein: **money leaves only when two independent parties agree.**

## The two parties

**You, with your wallet.** You start every action and you sign the transaction that actually moves money. But your wallet cannot move money on its own — the vault will not accept a transaction without a valid permission slip.

**The checker, inside protected hardware.** It reads your encrypted rules and decides whether a request obeys them. But it cannot move money either. It has no power to send your transaction and no access to your funds. All it can do is say yes or no.

Neither is enough alone. That is the entire security argument.

## Why the checker cannot be fooled

The obvious attack is to lie to it — send a request that claims a small amount while actually moving a large one.

That fails, because the checker does not believe anything the website says. For each decision it goes and reads the truth itself:

- the vault's real balance, owner, counter, and rule version, straight from Flare;
- the encrypted rules, from the vault's own storage;
- the current XRP price, from Flare's on-chain price feed;
- the current time, from the latest Flare block.

Then it signs a permission slip covering the **exact** operation, recipient, amount, dollar value, price timestamp, counter, rule version, and deadline. The vault re-derives all of that independently and rejects any mismatch.

So a tampered front end cannot widen a payment. It can only produce requests that get refused.

## Why a stolen permission slip is useless

A slip is bound to one payment and only that payment:

- **One exact action.** Change the amount or the recipient by any degree and the signature no longer matches.
- **A counter.** The vault's counter increases with every successful action, so a slip can be used once and never again.
- **A deadline.** Five minutes.
- **A price check.** The vault re-reads the live price when you execute. Moved more than 1%? Refused.

## Why a stolen wallet key is not enough

A thief with your key can:

- ask for payments (and be refused for anything that breaks your rules),
- deposit money into your vault,
- lock the vault,
- start a recovery — which sends **your** money to **your own** saved XRP Ledger address, after a delay, and which your guardian can cancel.

They cannot: pay an address you did not approve, exceed your limits, change your rules, redirect the cash-out address without waiting out the timelock, or read what your rules are.

## Where the trust actually sits

It is fair to ask what you are trusting.

You are trusting that the hardware really is what it claims to be. Flare maintains an on-chain registry of attested machines, and your vault checks against it every single time: the signature must come from the exact machine assigned to your vault, that machine must be marked `Production`, and it must be running the Serein extension. A machine that is paused, banned, or running different code is rejected by the contract, not by the website.

You are **not** trusting the website. You are not trusting Serein's operators to be honest about your balance or your rules. And you are not trusting the hardware to stay alive forever — that is what [recovery](../guides/lock-and-recovery.md) is for.
