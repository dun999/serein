# The problem

## One key holds everything

A normal crypto wallet has one line of defence: its private key. Whoever holds that key can do anything with the money — send all of it, anywhere, right now.

That is fine when nothing goes wrong. It is very bad when something does:

- You sign a transaction on a fake website that looked real.
- Malware reads the key off your computer.
- You approve a contract that turns out to be able to take everything.
- Someone gets your recovery phrase.

In every one of these cases the money is gone in a single transaction. There is no waiting period, no spending limit, no second opinion. The key said yes, so it happened.

## "Approve" is more dangerous than it looks

On EVM chains, apps ask you to "approve" a token before they can use it. People click this constantly. The catch is that a normal approval is often for an **unlimited** amount and does not expire.

So a single click can hand a contract permission to move every one of those tokens out of your wallet, whenever it likes, forever. Most people never check, and most people never take the permission back.

## Rules on a blockchain are usually public

You could try to fix this with an on-chain rulebook: a list of approved addresses, a daily limit, and so on.

The trouble is that a public blockchain is public. If your rules live on-chain in readable form, then everyone can see:

- who you pay,
- how much you move,
- how big your balance is allowed to be,
- and exactly where the gaps in your protection are.

For a person that is a privacy problem. For a business it is a competitive one — your suppliers, payroll size, and payment schedule become public information. And for an attacker, a published rulebook is a map: it tells them the largest amount that will go through without extra checks.

## What is actually needed

To be safe *and* private, three things have to be true at the same time:

1. **The wallet key is not enough by itself.** Something else must agree before money moves.
2. **The rules are actually enforced.** Not a warning in an app — enforced by the contract holding the money, so going around the website changes nothing.
3. **The rules stay private.** Nobody should be able to read your recipients or limits off the chain.

Doing any one of these is easy. Doing all three together is the hard part, and it is what Serein is for.

Next: [How Serein works](how-serein-works.md).
