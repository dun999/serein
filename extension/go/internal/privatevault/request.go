package privatevault

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// DecodeRequest mirrors abi.encode(vault, to, amount, stepUpProof) in the
// on-chain CovenantInstructionSender.
func DecodeRequest(message []byte, operation uint8) (Request, error) {
	addressT, _ := abi.NewType("address", "", nil)
	uint256T, _ := abi.NewType("uint256", "", nil)
	bytesT, _ := abi.NewType("bytes", "", nil)
	args := abi.Arguments{{Type: addressT}, {Type: addressT}, {Type: uint256T}, {Type: bytesT}}
	values, err := args.Unpack(message)
	if err != nil {
		return Request{}, fmt.Errorf("decode authorization request: %w", err)
	}
	if len(values) != 4 {
		return Request{}, fmt.Errorf("authorization request has wrong field count")
	}
	return Request{
		Vault: values[0].(common.Address), To: values[1].(common.Address),
		Amount: values[2].(*big.Int), StepUpProof: values[3].([]byte), Operation: operation,
	}, nil
}
