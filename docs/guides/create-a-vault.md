# Create a vault

Your vault is its own contract, used by you alone. Creating one takes two transactions and one passkey prompt.

## What you will be asked

**Your XRP Ledger address.** Where cash-outs and emergency recovery send XRP. Choose carefully — this address is locked in. It can be changed later, but only after a waiting period, and that delay is deliberate: it is what stops a thief redirecting your money.

**Approved recipients.** The Flare addresses this vault may pay. Anything not on the list is refused. You can change the list later.

**Most per payment.** The largest single payment, in dollars. A payment above this is refused outright.

**Most per day.** The total that may leave in a 24-hour period. Once reached, further payments wait for the next day.

**Passkey above.** The dollar amount above which your fingerprint or face is required. Set it low if you want to be asked often; set it higher for convenience. Cash-outs to XRP always require the passkey regardless of this setting.

**Guardian (optional).** A second address that can lock the vault in an emergency and cancel a recovery it did not expect. A guardian cannot spend, cannot change your rules, and cannot read them. Leave it blank if you do not want one.

## Choosing sensible limits

Limits are in **US dollars**, not FXRP. Serein converts using the live on-chain XRP price at the moment of each payment, so your limits keep their meaning as the price moves.

A reasonable starting point:

- **Most per payment** — the largest single payment you would make in a normal week.
- **Most per day** — roughly two or three of those.
- **Passkey above** — small enough that anything meaningful asks for your fingerprint. Routine small payments then stay quick.

You can change all of these later, so do not agonise over it.

## What happens when you click create

1. **Your rules are encrypted in your browser.** They are scrambled for the protected hardware before anything is sent. The website never sends them anywhere readable.
2. **The vault contract is created.** A fresh contract at an address only you own.
3. **Your passkey is enrolled.** Your device asks for a fingerprint, face, or PIN. What gets stored is a public key — no biometric data ever leaves your device.
4. **The encrypted rules are saved to the vault.** The chain gets the scrambled blob plus a short fingerprint of it, so it can later prove the rules were not swapped.

After this the vault is **active** and ready for money.

## Important: back up your passkey

Serein keeps a copy of your passkey details in your browser so it can prompt you at the right moment. **Clearing browser data can remove it.**

Use a password manager that syncs passkeys — iCloud Keychain, Google Password Manager, 1Password, Bitwarden — so the passkey survives clearing your browser or switching devices. If you lose the passkey entirely, actions above your threshold and all cash-outs stop being available, and your way out is the delayed recovery path.

Next: [Add money](add-money.md).
