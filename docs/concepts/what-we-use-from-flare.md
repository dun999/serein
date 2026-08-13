# What we use from Flare

Serein uses four Flare systems. Each does one job.

## FAssets — brings XRP to Flare

XRP cannot talk to smart contracts. FAssets issues **FXRP**, backed one-to-one by real XRP held by collateralised agents, and FXRP can be held and moved by contracts.

Serein uses it in both directions: minting FXRP into your vault when you send XRP, and redeeming FXRP back to real XRP when you cash out.

FXRP has six decimals, matching XRP's drops.

## FDC — proves the XRP payment happened

When you send XRP to mint FXRP, that payment happens on a different chain. Flare cannot simply take your word for it.

The **Flare Data Connector** produces a proof that a specific XRP Ledger payment really happened and was final. FAssets checks that proof before issuing FXRP.

This is why minting takes a few minutes rather than being instant, and it is the right trade: no proof, no FXRP.

## FTSOv2 — the live price

Your limits are in dollars, but the vault holds FXRP. Something has to convert.

**FTSOv2** provides an XRP/USD price on-chain, updated continuously. Serein reads it in two places:

- the checker prices your payment when deciding whether it fits your limits;
- the vault re-reads the price when you execute, and refuses if it has moved more than 1% since the permission was granted.

The vault also refuses prices older than an hour, or timestamped in the future.

Doing it this way means your "$50 per payment" limit keeps meaning $50 as the market moves, and nobody can feed the vault a stale or invented price — it comes from the chain, not from the app.

## FCC — keeps the rules private

**Flare Confidential Compute** runs code inside hardware that keeps its memory sealed even from the operator, and can prove on-chain which code it is running.

This is where your encrypted rules are unscrambled and checked, and it is the only place that ever happens. The machine is registered on-chain, and your vault verifies against that registry on every action: right machine, `Production` status, correct extension.

## How they fit together

```
You ask to pay
      │
      ▼
Flare: on-chain request  ──────────────┐
                                       ▼
                          FCC: unscramble rules, check them
                                       │
                          FTSOv2: what is this worth in USD?
                                       │
                                       ▼
                          Permission slip, signed
      ┌────────────────────────────────┘
      ▼
You execute → vault verifies signature, counter, deadline, price → FXRP moves
```

And for getting XRP in and out:

```
XRP payment  →  FDC proves it  →  FAssets issues FXRP  →  your vault
your vault   →  FAssets redeems  →  real XRP  →  your saved XRPL address
```

Two bounty tracks, one path: FAssets and FDC move value between chains; FTSOv2 and FCC decide what is allowed to leave.
