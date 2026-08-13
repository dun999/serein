package utils

import (
	"context"
	"math/big"
	"time"

	"covenant-fcc/tools/pkg/contracts/covenant"
	"covenant-fcc/tools/pkg/fccutils"
	"covenant-fcc/tools/pkg/support"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/pkg/errors"
)

const instructionFee = 1_000_000

func DeployInstructionSender(s *support.Support) (common.Address, *covenant.CovenantInstructionSender, error) {
	opts, err := bind.NewKeyedTransactorWithChainID(s.Prv, s.ChainID)
	if err != nil {
		return common.Address{}, nil, errors.Wrap(err, "create transactor")
	}
	address, tx, contract, err := covenant.DeployCovenantInstructionSender(
		opts, s.ChainClient, s.Addresses.FlareTeeManager,
	)
	if err != nil {
		return common.Address{}, nil, errors.Wrap(err, "deploy Covenant instruction sender")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	receipt, err := bind.WaitMined(ctx, s.ChainClient, tx)
	if err != nil {
		return common.Address{}, nil, errors.Wrap(err, "wait for sender deployment")
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return common.Address{}, nil, errors.New("instruction sender deployment failed")
	}
	return address, contract, nil
}

func SetExtensionId(s *support.Support, instructionSenderAddress common.Address) error {
	sender, err := covenant.NewCovenantInstructionSender(instructionSenderAddress, s.ChainClient)
	if err != nil {
		return errors.Wrap(err, "bind instruction sender")
	}
	opts, err := bind.NewKeyedTransactorWithChainID(s.Prv, s.ChainID)
	if err != nil {
		return errors.Wrap(err, "create transactor")
	}
	tx, err := sender.SetExtensionId(opts)
	if err != nil {
		if reason := fccutils.DecodeRevertReason(err); reason != "" {
			return errors.Errorf("set extension id: %s", reason)
		}
		return errors.Wrap(err, "set extension id")
	}
	receipt, err := bind.WaitMined(context.Background(), s.ChainClient, tx)
	if err != nil {
		return errors.Wrap(err, "wait for extension id")
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return errors.New("set extension id transaction failed")
	}
	return nil
}

type AuthorizationKind uint8

const (
	AuthorizeSpend AuthorizationKind = iota
	AuthorizeWithdraw
	AuthorizeRedeem
)

func SendAuthorization(
	s *support.Support,
	instructionSenderAddress common.Address,
	kind AuthorizationKind,
	vault common.Address,
	to common.Address,
	amount *big.Int,
	stepUpProof []byte,
) (common.Hash, common.Hash, error) {
	sender, err := covenant.NewCovenantInstructionSender(instructionSenderAddress, s.ChainClient)
	if err != nil {
		return common.Hash{}, common.Hash{}, errors.Wrap(err, "bind instruction sender")
	}
	opts, err := bind.NewKeyedTransactorWithChainID(s.Prv, s.ChainID)
	if err != nil {
		return common.Hash{}, common.Hash{}, errors.Wrap(err, "create transactor")
	}
	opts.Value = big.NewInt(instructionFee)

	var tx *types.Transaction
	switch kind {
	case AuthorizeSpend:
		tx, err = sender.RequestSpend(opts, vault, to, amount, stepUpProof)
	case AuthorizeWithdraw:
		tx, err = sender.RequestWithdraw(opts, vault, amount, stepUpProof)
	case AuthorizeRedeem:
		tx, err = sender.RequestRedeem(opts, vault, amount, stepUpProof)
	default:
		return common.Hash{}, common.Hash{}, errors.New("unknown authorization kind")
	}
	if err != nil {
		return common.Hash{}, common.Hash{}, errors.Wrap(err, "send authorization instruction")
	}
	receipt, err := bind.WaitMined(context.Background(), s.ChainClient, tx)
	if err != nil {
		return common.Hash{}, common.Hash{}, errors.Wrap(err, "wait for authorization instruction")
	}
	if receipt.Status != types.ReceiptStatusSuccessful {
		return common.Hash{}, common.Hash{}, errors.New("authorization instruction transaction failed")
	}
	for _, log := range receipt.Logs {
		instruction, parseErr := s.TeeVerification.ParseTeeInstructionsSent(*log)
		if parseErr == nil {
			return instruction.InstructionId, receipt.TxHash, nil
		}
	}
	return common.Hash{}, common.Hash{}, errors.New("TeeInstructionsSent event was not found")
}
