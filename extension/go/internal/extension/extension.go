// Package extension is Covenant's Flare Confidential Compute entry point.
package extension

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"covenant-fcc/internal/config"
	"covenant-fcc/internal/privatevault"
	"covenant-fcc/pkg/types"

	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/tee-node/pkg/processorutils"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

type Extension struct {
	mu     sync.RWMutex
	Server *http.Server
	engine *privatevault.Engine

	authorizations int
	refusals       int
}

func New(extensionPort, signPort int, engine *privatevault.Engine) *Extension {
	ext := &Extension{engine: engine}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /state", ext.stateHandler)
	mux.HandleFunc("POST /action", ext.actionHandler)
	ext.Server = &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: mux}
	return ext
}

func (e *Extension) stateHandler(w http.ResponseWriter, r *http.Request) {
	e.mu.RLock()
	response := types.StateResponse{
		StateVersion: teeutils.ToHash(config.Version),
		State: types.State{
			Tee: e.engine.Address().Hex(), ChainID: e.engine.ChainID(),
			PolicyPublicKey: e.engine.PolicyPublicKey(),
			Authorizations:  e.authorizations, Refusals: e.refusals,
		},
	}
	e.mu.RUnlock()
	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, fmt.Sprintf("sending response: %v", err), http.StatusInternalServerError)
	}
}

func (e *Extension) processAction(ctx context.Context, action teetypes.Action) (int, []byte) {
	df, err := processorutils.Parse[instruction.DataFixed](action.Data.Message)
	if err != nil {
		return http.StatusBadRequest, []byte(fmt.Sprintf("decoding fixed data: %v", err))
	}
	if df.OPType != teeutils.ToHash(config.OPTypeCovenant) {
		return http.StatusNotImplemented, []byte("unsupported operation type")
	}
	if df.OPCommand == teeutils.ToHash(config.OPCommandAuthorizeAdmin) {
		return e.processAdminAction(ctx, action, df)
	}

	var operation uint8
	switch df.OPCommand {
	case teeutils.ToHash(config.OPCommandAuthorizeSpend):
		operation = privatevault.OperationSpend
	case teeutils.ToHash(config.OPCommandAuthorizeWithdraw):
		operation = privatevault.OperationWithdraw
	case teeutils.ToHash(config.OPCommandAuthorizeRedeem):
		operation = privatevault.OperationRedeem
	default:
		return http.StatusNotImplemented, []byte("unsupported Covenant command")
	}

	req, err := privatevault.DecodeRequest(df.OriginalMessage, operation)
	if err != nil {
		result := buildResult(action, df, nil, 0, err)
		body, _ := json.Marshal(result)
		return http.StatusOK, body
	}
	decisionCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	result, err := e.engine.Authorize(decisionCtx, req)
	if err != nil {
		e.mu.Lock()
		e.refusals++
		e.mu.Unlock()
		body, _ := json.Marshal(buildResult(action, df, nil, 0, err))
		return http.StatusOK, body
	}

	e.mu.Lock()
	e.authorizations++
	e.mu.Unlock()
	data, _ := json.Marshal(types.AuthorizationResponse{
		Tee: result.Tee.Hex(), Authorization: "0x" + hex.EncodeToString(result.Authorization),
		Digest: result.Digest.Hex(), Nonce: result.Nonce.String(), Deadline: result.Deadline,
		AmountUSD: fmt.Sprintf("%d", result.AmountUSD), PriceTimestamp: result.PriceTimestamp,
		PolicyVersion: result.PolicyVersion, Operation: result.Operation, XrplPayout: result.XrplPayout,
	})
	body, _ := json.Marshal(buildResult(action, df, data, 1, nil))
	return http.StatusOK, body
}

func (e *Extension) processAdminAction(
	ctx context.Context,
	action teetypes.Action,
	df *instruction.DataFixed,
) (int, []byte) {
	req, err := privatevault.DecodeAdminRequest(df.OriginalMessage)
	if err != nil {
		body, _ := json.Marshal(buildResult(action, df, nil, 0, err))
		return http.StatusOK, body
	}
	decisionCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	result, err := e.engine.AuthorizeAdmin(decisionCtx, req)
	if err != nil {
		e.mu.Lock()
		e.refusals++
		e.mu.Unlock()
		body, _ := json.Marshal(buildResult(action, df, nil, 0, err))
		return http.StatusOK, body
	}

	e.mu.Lock()
	e.authorizations++
	e.mu.Unlock()
	data, _ := json.Marshal(types.AuthorizationResponse{
		Tee: result.Tee.Hex(), Authorization: "0x" + hex.EncodeToString(result.Authorization),
		Digest: result.Digest.Hex(), Nonce: result.Nonce.String(), Deadline: result.Deadline,
		PolicyVersion: result.PolicyVersion, AdminAction: &result.Action,
		PayloadHash: result.PayloadHash.Hex(),
	})
	body, _ := json.Marshal(buildResult(action, df, data, 1, nil))
	return http.StatusOK, body
}
