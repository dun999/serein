package privatevault

import (
	"fmt"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// DecodeAdminRequest mirrors abi.encode(vault, action, payloadHash,
// stepUpProof) in CovenantInstructionSender.
func DecodeAdminRequest(message []byte) (AdminRequest, error) {
	addressT, _ := abi.NewType("address", "", nil)
	uint8T, _ := abi.NewType("uint8", "", nil)
	bytes32T, _ := abi.NewType("bytes32", "", nil)
	bytesT, _ := abi.NewType("bytes", "", nil)
	args := abi.Arguments{{Type: addressT}, {Type: uint8T}, {Type: bytes32T}, {Type: bytesT}}
	values, err := args.Unpack(message)
	if err != nil {
		return AdminRequest{}, fmt.Errorf("decode admin authorization request: %w", err)
	}
	if len(values) != 4 {
		return AdminRequest{}, fmt.Errorf("admin authorization request has wrong field count")
	}
	return AdminRequest{
		Vault: values[0].(common.Address), Action: values[1].(uint8),
		PayloadHash: values[2].([32]byte), StepUpProof: values[3].([]byte),
	}, nil
}
