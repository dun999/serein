# Encrypted rules

Serein's rules are enforced on a public chain without being published on it.

## What is public and what is not

Anyone reading the blockchain can see:

- that a vault exists and who owns it,
- its FXRP balance,
- how many actions it has taken,
- which rule version it is on,
- a scrambled blob of rules and a short fingerprint of it,
- and the XRP Ledger address for cash-outs.

Nobody can see:

- who is on your approved list,
- your per-payment limit,
- your daily limit,
- the amount that triggers your passkey,
- the labels or names you gave things.

## How the scrambling works

When you save rules, your browser encrypts them for one specific piece of hardware, using that machine's public key. Only that machine can unscramble them.

The encrypted package is tied to your chain, your vault address, and your rule version. Copy it to a different vault and it will not open — the checker verifies that binding before it reads anything.

Alongside the blob, the vault stores a **fingerprint** (a hash) of the rules. Whenever the checker unscrambles them, it re-computes the fingerprint and compares. If someone swapped the blob for a different one, the fingerprint would not match and the request is refused. That is what stops a tampered rulebook being slipped in.

## Why the same rules always scramble identically

The rules are converted to a strict, predictable text form before encryption: recipient addresses lowercased and sorted, numbers written one canonical way. Without this, the same rules could produce different fingerprints depending on incidental ordering, and the fingerprint check would be unreliable.

## What the hardware gives you

The checker runs inside Flare Confidential Compute — hardware that keeps its memory sealed from the machine's operator. The person running the server cannot read what is inside, and the machine can prove to the chain what code it is running.

That proof is what your vault checks. It is registered on-chain with a status, and your vault requires the exact registered machine, marked `Production`, running the Serein extension. If any of that stops being true, the contract refuses — no website involved.

## Being honest about the limits

Nothing is perfectly private.

**Amounts and timing are public.** The blockchain records every payment: how much, to whom, and when. Serein hides the *rules*, not the transactions. Someone watching your vault learns who you actually paid, even though they cannot read who you *could* have paid.

**Refusals leak a little.** A refusal is a public transaction. A patient observer could send requests and narrow down where your limits sit — though only you can produce valid requests from your vault, which makes this expensive.

**Confidential hardware is not magic.** It is a strong protection with a real track record of occasional vulnerabilities. Serein's answer is not to claim the hardware is unbreakable, but to limit what breaking it would achieve: the checker can only *approve* actions, never initiate them, and every approval is still checked by the contract against the counter, the deadline, the live price, and the registry.

For the exact formats, see [Architecture](../architecture.md).
