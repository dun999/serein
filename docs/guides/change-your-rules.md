# Change your rules

Your rules are not fixed forever. What matters is that changing them is not something a stolen wallet key can do quietly.

## Changing limits and recipients

On the **Rules** page you can edit your approved recipients, your per-payment limit, your daily limit, and your passkey threshold.

Saving requires **your passkey**, every time, whatever you changed.

That is the important protection. A thief with only your wallet key cannot add themselves as a recipient, cannot raise your limits, and cannot lower your passkey threshold. Without the passkey the rulebook is closed to them.

### What happens when you save

1. The new rules are encrypted in your browser, exactly as when you created the vault.
2. Your passkey signs a proof tied to this specific change, this vault, and its current counter.
3. The protected hardware verifies the passkey against the credential in your **current** rules, then signs off.
4. The vault stores the new encrypted rules and moves to a new version number.

Old permission slips stop working the moment the version changes, so nothing granted under the old rules can be used under the new ones.

## Changing where cash-outs go

Changing your saved XRP Ledger address uses a **timelock**: you propose the new address, then wait — 24 hours by default — before it takes effect.

This delay is the point. Redirecting the exit is exactly what an attacker would want to do first, and the wait gives you time to notice. Your guardian, if you have one, can cancel a proposal during the wait.

The same delayed process protects changes to the guardian and to which hardware checker the vault trusts.

## What each party can actually do

| | You (owner) | Guardian | The checker |
| --- | --- | --- | --- |
| Ask for a payment | Yes | No | No |
| Approve a payment | No | No | Yes |
| Change the rules | With passkey | No | No |
| Read the rules | Yes | No | Briefly, to check one payment |
| Lock the vault | Yes | Yes | No |
| Cancel a recovery | Yes | Yes | No |
| Move money on its own | No | No | No |

Nobody in that table can move money alone. That is the property worth keeping.

Next: [Lock and recovery](lock-and-recovery.md).
