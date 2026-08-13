# Get money out

There are three ways out, for three different situations.

| Way | Goes to | Needs passkey | Use it when |
| --- | --- | --- | --- |
| **Withdraw** | Your own Flare wallet, as FXRP | Above your threshold | You want some money back, vault stays open |
| **Cash out** | Your saved XRP Ledger address, as real XRP | Always | You want XRP on the XRP Ledger |
| **Close the vault** | Your own Flare wallet, everything | Always | You are finished with this vault |

## Withdraw — money back, vault stays open

On the **overview** page. Works like a payment, but the destination is always your own wallet, so your approved-recipient list does not apply.

1. Enter the amount.
2. Request authorization, and confirm the passkey prompt if asked.
3. Click **Execute withdrawal**.

Your per-payment and daily limits **still apply**. This is on purpose: if they did not, anyone with your wallet key could drain the vault to their own address and the limits would be pointless.

Withdrawing is not available while the vault is locked.

## Cash out — real XRP on the XRP Ledger

On the **Cash out** page. Turns FXRP back into XRP and sends it to the XRP Ledger address you saved when you created the vault.

- **It always asks for your passkey**, whatever the amount.
- **The destination cannot be changed here.** It is fixed to your saved address. Changing that address is a separate action with a waiting period.
- **There is a minimum**, set by FAssets. The page shows the current one.

Because the destination is fixed, this route cannot be used to steal — someone with your wallet key could only push your own XRP to your own address.

### If it says the whole balance could not be redeemed

FAssets settles redemptions in whole "lots". If your balance is not a whole number of lots, the remainder cannot go out this way. Withdraw the remainder to your Flare wallet instead.

## Close the vault

On the **Cash out** page, under Destroy vault. This returns the **entire** balance to your wallet and permanently closes the vault. It needs your passkey.

Once closed, a vault cannot be reopened. Create a new one if you need another.

If FXRP somehow arrives at a closed vault later, there is a sweep function that returns it to the owner, so nothing is trapped.

## If your vault is locked

A locked vault cannot withdraw, pay, or cash out. Unlock it first — see [Lock and recovery](lock-and-recovery.md). Unlocking has a waiting period.

Next: [Change your rules](change-your-rules.md).
