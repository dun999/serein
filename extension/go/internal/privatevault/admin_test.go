package privatevault

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestAdminAuthorizationDigestMatchesSolidityFixture(t *testing.T) {
	_, digest, err := adminAuthorizationPayload(
		114,
		common.HexToAddress("0x000000000000000000000000000000000000c0de"),
		AdminPolicyUpdate,
		common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		big.NewInt(7),
		3,
		1_700_000_300,
	)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "0x2c761dd726613f7715aa61ac9ccaa071cf1df6d801d1c089c851050c42936a00"
	if digest.Hex() != expected {
		t.Fatalf("digest mismatch: got %s want %s", digest.Hex(), expected)
	}
}

func TestAdminStepUpDigestBindsActionAndPayload(t *testing.T) {
	request := AdminRequest{
		Vault: common.HexToAddress("0x000000000000000000000000000000000000c0de"),
		Action: AdminPolicyUpdate,
		PayloadHash: common.HexToHash(
			"0x1111111111111111111111111111111111111111111111111111111111111111",
		),
	}
	digest, err := adminStepUpDigest(114, request, big.NewInt(7), 3)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "0xd1f66074d5e4293a2bbc94490a47922630a780187747b6fdb39123df70178925"
	if common.BytesToHash(digest[:]).Hex() != expected {
		t.Fatalf("digest mismatch: got %s want %s", common.BytesToHash(digest[:]).Hex(), expected)
	}

	request.Action = AdminDestroy
	destroyDigest, err := adminStepUpDigest(114, request, big.NewInt(7), 3)
	if err != nil {
		t.Fatal(err)
	}
	if digest == destroyDigest {
		t.Fatal("different admin actions produced the same passkey challenge")
	}
}
