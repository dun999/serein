# Make a payment

Paying from the vault takes two transactions: one to ask, one to send.

## Sending

1. Go to **Pay**.
2. Enter the recipient and the amount.
3. Click to request authorization. Your wallet asks you to confirm — this is the request, not the payment.
4. If the amount is above your passkey threshold, your device asks for a fingerprint, face, or PIN.
5. Wait a moment for the answer.
6. If approved, an **Execute payment** button appears. Click it and confirm in your wallet. The money moves.

## Do it while it is fresh

The permission slip expires after **five minutes**, and it is tied to the vault's current counter and the current price.

In practice: click Execute right after you get it. If you wait too long, or make another payment in between, it stops being valid and you simply request a new one. Nothing is lost except the gas for the request.

## When you get refused

A refusal means the system worked and said no. The app tells you which rule it was:

| Message | What happened | What to do |
| --- | --- | --- |
| Recipient not approved | The address is not on your list | Add it — see [Change your rules](change-your-rules.md) |
| Per-payment limit exceeded | Too big for one payment | Split it, or raise the limit |
| Daily limit exceeded | Would break today's total | Wait for the next day, or raise the limit |
| Passkey verification refused | The fingerprint proof did not check out | Try again; make sure you are on the same site and password manager |

A refusal costs you the gas for the request transaction. That is unavoidable — the check genuinely ran on-chain.

## Why the two steps

The first transaction is a public, on-chain record that you asked. The checker watches for it, does its own independent work, and answers.

It never trusts what the website tells it. It reads the vault's real balance, counter, and encrypted rules straight from Flare, and it prices the payment using Flare's live on-chain price feed. So a tampered website cannot talk it into approving something your rules forbid.

The second transaction carries the answer to the vault, which verifies the signature came from registered hardware before releasing anything.

## Limits are in dollars

Your limits are dollar amounts, converted at the live on-chain XRP price at the moment of the payment. So "at most $50 per payment" keeps meaning $50 whether XRP is up or down.

The vault double-checks the price when you execute. If the price has moved more than 1% since the permission was granted, it refuses and you request a fresh one. This stops an old permission being reused after a big market move.

Next: [Get money out](get-money-out.md).
