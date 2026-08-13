# How Serein works

## The main idea

Your money does not sit in your wallet. It sits in a **vault** — a small contract that belongs only to you.

The vault has no "send anywhere" button. To move money out, two separate parties must agree:

1. **You**, with your wallet, ask for the payment.
2. **A checker**, running inside protected hardware, confirms the payment follows your rules.

Only when both agree does the money move. Your wallet alone cannot do it. The checker alone cannot do it either — it can approve, but it cannot submit the transaction or take your money.

This is the whole design. Everything else is detail.

## Where the rules live

When you open a vault, you choose your rules:

- which addresses may receive money,
- the most that can leave in one payment,
- the most that can leave in one day,
- the amount above which your fingerprint or face is required,
- and the XRP Ledger address that cash-outs must go to.

Those answers are **encrypted before they leave your browser**. What goes on the blockchain is a scrambled blob plus a short fingerprint of it. Nobody reading the chain can tell who is on your list or what your limits are.

The only place the rules are ever unscrambled is inside the protected hardware, for the few milliseconds it takes to check one payment.

## What happens when you pay someone

It takes two transactions. This is on purpose.

**Step one — you ask.** You send a small on-chain message: "I want to send this much, to this address, from this vault." This is a request, not a payment. Nothing has moved.

**Step two — the checker answers.** The protected service notices your request and does its own work. It does not trust the website. It reads the vault's real state directly from Flare, unscrambles your rules, and checks:

- Is this recipient on your approved list?
- Is this payment under your single-payment limit?
- Would it push you over your daily limit?
- Is it big enough to need your fingerprint? If so, is the fingerprint proof valid?
- What is this worth in dollars right now, using the live on-chain price?

If everything passes, it signs a permission slip for that **exact** payment. If anything fails, it refuses and tells you which rule said no.

**Step three — you execute.** You send the second transaction, carrying the permission slip. The vault checks the signature really came from the registered hardware, checks the amount and recipient match exactly, checks the slip has not been used before and has not expired — then, and only then, sends the money.

## Why this is hard to attack

The permission slip is useless to a thief:

- It works for **one exact payment** — that amount, that recipient, that vault.
- It has a **counter**, so it cannot be replayed.
- It **expires** after five minutes.
- The vault checks the price used is still current, so an old slip cannot be reused after the market moves.

And a stolen wallet key does not help. The thief can ask for payments all day. The checker will refuse every one that breaks your rules, and it will not tell them what the rules are.

## The safety valve

Protected hardware could go offline. If Serein depended on it completely, your money could be stuck forever.

So there is an escape hatch that does not need the checker at all. You (or your guardian) can lock the vault, start a recovery, and after a waiting period send **the whole balance** to the XRP Ledger address you saved when you created the vault.

That destination is fixed in advance and cannot be changed quickly. So the escape hatch is a way out for you, not a way in for an attacker — even someone with your wallet key can only push funds to the address you already chose, and only after the delay, which gives you time to notice and cancel.

Next: [Getting started](getting-started.md), or read [Two approvals](concepts/two-approvals.md) for a closer look.
