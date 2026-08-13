# Add money

There are two ways to fund a vault. Use the first if you already hold FXRP. Use the second to turn real test XRP into FXRP.

## What FXRP is

FXRP is XRP represented on Flare, backed one-to-one and issued by Flare's FAssets system. XRP itself cannot talk to smart contracts; FXRP can. It has six decimal places, the same as XRP.

## Option 1 — move FXRP you already hold

Two transactions, on the **Add funds** page.

1. **Approve.** Enter the amount and approve it. This permits the vault to collect exactly that amount.
2. **Deposit.** Confirm, and the FXRP moves in.

The approval is deliberately narrow — it lets the vault pull that amount in, and nothing else. It cannot be used to move funds back out. Money only ever leaves through the two-approval process.

## Option 2 — mint new FXRP from XRP

This sends real test XRP on the XRP Ledger and gets FXRP back, delivered straight into your vault. It never touches your Flare wallet on the way.

1. Enter how much XRP to send. Serein shows the current fees and what you will actually receive.
2. A Xaman request appears — scan it, or open it on your phone.
3. Approve the payment in Xaman. Make sure Xaman is on **Testnet**.
4. Wait. This is the part that takes a few minutes.

### Why the wait

The payment happens on the XRP Ledger, but the FXRP is issued on Flare. Those are separate chains, so Flare has to be *shown proof* that your XRP payment really happened and was final. That proof is produced by Flare's Data Connector, and then an executor uses it to issue your FXRP.

A few minutes is normal. Nothing is stuck.

### You can close the page

The mint continues without you. The app records where it is, so if you reload or come back later, the progress card returns with a running timer. Finished mints stay in an **Earlier direct mints** list underneath, with a link to the XRP Ledger transaction.

If you want to check independently, open the XRP Ledger transaction link and confirm it succeeded. Once it has, the FXRP will arrive.

### The memo matters

The payment carries a 32-byte memo that names your vault. That memo is how the FAssets system knows where to deliver the FXRP. Serein builds it for you.

If you ever send the payment by hand, the memo must be exactly right. Get it wrong and the FXRP goes somewhere else, or nowhere. Use the **Copy memo** button rather than typing it.

## Which vault am I funding?

If you own more than one vault, check the address shown on the page before minting. The mint is addressed to one specific vault, and it cannot be redirected once sent.

This matters most if you have an older vault from a previous version. The app lists all your vaults on the overview page and marks the older ones, so you can switch to the right one first.

Next: [Make a payment](make-a-payment.md).
