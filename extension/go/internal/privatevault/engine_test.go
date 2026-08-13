package privatevault

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

// This value is also asserted by CovenantVault.t.sol. It catches the most
// dangerous integration failure here: Go signing bytes that Solidity interprets
// as a different authorization.
func TestAuthorizationDigestMatchesSolidityFixture(t *testing.T) {
	digest, err := authorizationDigest(
		114,
		common.HexToAddress("0x000000000000000000000000000000000000c0de"),
		OperationSpend,
		common.HexToAddress("0x0000000000000000000000000000000000000b0b"),
		common.Hash{},
		big.NewInt(20_000_000),
		1_000_000_000,
		1_700_000_000,
		big.NewInt(7),
		3,
		1_700_000_300,
	)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "0xd9d00eb29ce3c8c83a0418dbffcc444636688a01d6ecd9deb01d97dae2ede182"
	if digest.Hex() != expected {
		t.Fatalf("digest mismatch: got %s want %s", digest.Hex(), expected)
	}
}

func TestDailyCapCheckCannotOverflow(t *testing.T) {
	if !exceedsDailyCap(new(big.Int).SetUint64(^uint64(0)), 2, ^uint64(0)) {
		t.Fatal("uint64 addition overflow would have bypassed the daily cap")
	}
	if exceedsDailyCap(big.NewInt(40), 2, 42) {
		t.Fatal("amount exactly at the remaining cap should be allowed")
	}
}

func TestPriceRejectsZeroAndUnsupportedDecimals(t *testing.T) {
	if _, err := priceUSD(1_000_000, 0, 6); err == nil {
		t.Fatal("zero FTSO value was accepted")
	}
	if _, err := priceUSD(1_000_000, 1, 19); err == nil {
		t.Fatal("unsupported FTSO decimals were accepted")
	}
}

func TestRedemptionIsAnAlwaysPasskeyProtectedExit(t *testing.T) {
	if enforcesSpendingCaps(OperationRedeem) {
		t.Fatal("redemption was incorrectly treated as merchant spending")
	}
	if !requiresStepUp(OperationRedeem, 1, ^uint64(0)) {
		t.Fatal("redemption did not require a passkey below the normal threshold")
	}
	if !enforcesSpendingCaps(OperationSpend) || !enforcesSpendingCaps(OperationWithdraw) {
		t.Fatal("spend or withdraw bypassed the confidential spending caps")
	}
	if requiresStepUp(OperationSpend, 100, 100) {
		t.Fatal("a spend exactly at the threshold unexpectedly required step-up")
	}
	if !requiresStepUp(OperationSpend, 101, 100) {
		t.Fatal("a spend above the threshold did not require step-up")
	}
}
