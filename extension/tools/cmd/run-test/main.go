package main

import (
	"encoding/json"
	"flag"
	"math/big"
	"strings"

	"covenant-fcc/tools/pkg/configs"
	"covenant-fcc/tools/pkg/fccutils"
	"covenant-fcc/tools/pkg/support"
	instrutils "covenant-fcc/tools/pkg/utils"

	"github.com/ethereum/go-ethereum/common"
	"github.com/flare-foundation/go-flare-common/pkg/logger"
	"github.com/pkg/errors"
)

type authorizationResponse struct {
	Tee            string `json:"tee"`
	Authorization  string `json:"authorization"`
	Digest         string `json:"digest"`
	Nonce          string `json:"nonce"`
	Deadline       uint64 `json:"deadline"`
	AmountUSD      string `json:"amountUsd"`
	PriceTimestamp uint64 `json:"priceTimestamp"`
	PolicyVersion  uint64 `json:"policyVersion"`
	Operation      uint8  `json:"operation"`
}

func main() {
	af := flag.String("a", configs.AddressesFile, "file with deployed addresses")
	cf := flag.String("c", configs.ChainNodeURL, "chain node URL")
	pf := flag.String("p", configs.ExtensionProxyURL, "extension proxy URL")
	senderFlag := flag.String("instructionSender", "", "CovenantInstructionSender address")
	vaultFlag := flag.String("vault", "", "initialized CovenantVault address")
	toFlag := flag.String("to", "", "recipient already allowed by the private policy")
	amountFlag := flag.String("amount", "1000000", "FXRP amount in drops")
	flag.Parse()

	if !common.IsHexAddress(*senderFlag) || !common.IsHexAddress(*vaultFlag) || !common.IsHexAddress(*toFlag) {
		fccutils.FatalWithCause(errors.New("instructionSender, vault, and to must be EVM addresses"))
	}
	amount, ok := new(big.Int).SetString(*amountFlag, 10)
	if !ok || amount.Sign() <= 0 {
		fccutils.FatalWithCause(errors.New("amount must be positive"))
	}

	testSupport, err := support.DefaultSupport(*af, *cf)
	if err != nil {
		fccutils.FatalWithCause(err)
	}
	sender := common.HexToAddress(*senderFlag)
	if err := instrutils.SetExtensionId(testSupport, sender); err != nil {
		if !strings.Contains(err.Error(), "already set") {
			fccutils.FatalWithCause(err)
		}
	}

	logger.Infof("Sending COVENANT/AUTHORIZE_SPEND instruction")
	instructionID, txHash, err := instrutils.SendAuthorization(
		testSupport, sender, instrutils.AuthorizeSpend,
		common.HexToAddress(*vaultFlag), common.HexToAddress(*toFlag), amount, nil,
	)
	if err != nil {
		fccutils.FatalWithCause(err)
	}
	logger.Infof("Instruction %s submitted in %s", instructionID.Hex(), txHash.Hex())

	actionResponse, err := fccutils.ActionResult(*pf, instructionID)
	if err != nil {
		fccutils.FatalWithCause(err)
	}
	result := actionResponse.Result
	if result.Status == 0 {
		fccutils.FatalWithCause(errors.Errorf("FCC policy refusal: %s", result.Log))
	}
	if result.Status != 1 {
		fccutils.FatalWithCause(errors.New("FCC instruction did not complete"))
	}

	var authorization authorizationResponse
	if err := json.Unmarshal(result.Data, &authorization); err != nil {
		fccutils.FatalWithCause(err)
	}
	if authorization.Operation != 0 || authorization.Authorization == "" || authorization.Digest == "" {
		fccutils.FatalWithCause(errors.New("FCC returned an incomplete spend authorization"))
	}
	logger.Infof(
		"FCC authorization verified: TEE=%s nonce=%s policyVersion=%d amountUSD=%s",
		authorization.Tee, authorization.Nonce, authorization.PolicyVersion, authorization.AmountUSD,
	)
}
