# Lock and recovery

These are the emergency controls. They are on the **Cash out** page.

## Locking

Locking stops everything immediately — no payments, no withdrawals, no cash-outs, no rule changes. Either you or your guardian can do it, and it takes effect at once.

Use it if you think your wallet key is compromised, or if something looks wrong and you want everything to stop while you work out what.

{% hint style="warning" %}
**Locking is not instant to undo.** Reopening the vault takes a waiting period — 24 hours by default. Do not lock the vault just to see what happens.
{% endhint %}

## Unlocking

Two steps with a wait between them:

1. **Start unlock.** This begins the countdown. The page shows the time remaining.
2. **Confirm unlock**, once the countdown reaches zero. The vault becomes active again.

The delay exists because if unlocking were instant, locking would be worthless — an attacker with your key would just unlock and carry on.

## Recovery — the way out if the checker is gone

Serein needs its protected hardware to approve normal payments. If that service disappeared permanently, ordinary payments would stop working. Recovery is the escape hatch that does not involve it at all.

Three steps:

1. **Lock the vault.**
2. **Schedule recovery.** This starts a countdown, 24 hours by default. The page shows the time left.
3. **Execute recovery** once it reaches zero. The **entire** balance is redeemed to the XRP Ledger address saved in the vault.

Note the order. You cannot execute a recovery that was never scheduled, and you cannot execute one before its countdown ends — the contract refuses, and the button stays disabled until it would actually work.

### Why it is safe to leave open

Recovery bypasses the rule checker, which sounds alarming until you see the limits on it:

- It sends to the **address you already committed to**, which cannot be changed quickly.
- It takes **everything** — there is no way to skim a portion.
- It has a **waiting period**, so it cannot happen quietly.
- Your **guardian can cancel it** during the wait.

So an attacker with your wallet key gains nothing: they can start a recovery, but the money lands in your own XRP Ledger address, and you or your guardian have a day to cancel.

## Which should I use?

| Situation | Do this |
| --- | --- |
| Key possibly stolen, funds still fine | Lock, then move funds out normally once you are sure |
| Want to stop everything right now | Lock |
| Locked it by mistake | Start unlock, wait, confirm |
| The FCC service is down for good | Lock, schedule recovery, execute after the wait |
| Finished with the vault | Close it — see [Get money out](get-money-out.md) |

Next: [What we use from Flare](../concepts/what-we-use-from-flare.md).
