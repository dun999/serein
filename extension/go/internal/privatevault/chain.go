package privatevault

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

const readABI = `[
  {"name":"owner","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
  {"name":"tee","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
  {"name":"status","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint8"}]},
  {"name":"policyCommitment","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"bytes32"}]},
  {"name":"encryptedPolicy","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"bytes"}]},
  {"name":"policyVersion","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint64"}]},
  {"name":"balance","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
  {"name":"nonce","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
  {"name":"spentUsdByDay","type":"function","stateMutability":"view","inputs":[{"type":"uint64"}],"outputs":[{"type":"uint256"}]},
  {"name":"xrplPayout","type":"function","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]},
  {"name":"getFeedById","type":"function","stateMutability":"payable","inputs":[{"type":"bytes21"}],"outputs":[{"type":"uint256"},{"type":"int8"},{"type":"uint64"}]}
]`

var xrpUSDFeedID = mustFeedID("015852502f55534400000000000000000000000000")

type Chain struct {
	rpcURL string
	ftso   common.Address
	abi    abi.ABI
	http   *http.Client
	now    func() time.Time
}

type Snapshot struct {
	Timestamp      uint64
	Vault          VaultState
	PriceValue     uint64
	PriceDecimals  uint8
	PriceTimestamp uint64
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcError struct {
	Message string `json:"message"`
}

type rpcResponse struct {
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

type batchCall struct {
	id     int
	method string
}

type VaultState struct {
	Owner            common.Address
	Tee              common.Address
	Status           uint8
	PolicyCommitment common.Hash
	EncryptedPolicy  []byte
	PolicyVersion    uint64
	Balance          *big.Int
	Nonce            *big.Int
	SpentTodayUSD    *big.Int
	XrplPayout       string
}

func NewChain(rpcURL string, ftso common.Address, httpClient *http.Client) (*Chain, error) {
	parsed, err := abi.JSON(strings.NewReader(readABI))
	if err != nil {
		return nil, fmt.Errorf("parse private vault ABI: %w", err)
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Chain{rpcURL: rpcURL, ftso: ftso, abi: parsed, http: httpClient, now: time.Now}, nil
}

// Snapshot reads every value needed for one authorization in a single JSON-RPC
// batch. tee-node gives extensions a fixed two-second response budget, so doing
// these independent eth_call requests sequentially is both slower and less
// consistent than reading them together at the same "latest" block tag.
//
// The host clock is used only to prefetch the likely UTC policy days. The day
// that is actually selected is derived from the canonical Flare block timestamp;
// if it is not among the prefetched days the request fails closed.
func (c *Chain) Snapshot(ctx context.Context, vault common.Address, includeDecisionData bool) (Snapshot, error) {
	requests := []rpcRequest{{
		JSONRPC: "2.0", ID: 1, Method: "eth_getBlockByNumber", Params: []any{"latest", false},
	}}
	calls := make(map[int]batchCall)
	nextID := 2
	addCall := func(to common.Address, method string, args ...any) (int, error) {
		data, err := c.abi.Pack(method, args...)
		if err != nil {
			return 0, fmt.Errorf("pack %s: %w", method, err)
		}
		id := nextID
		nextID++
		requests = append(requests, rpcRequest{
			JSONRPC: "2.0", ID: id, Method: "eth_call",
			Params: []any{map[string]string{
				"to": to.Hex(), "data": "0x" + hex.EncodeToString(data),
			}, "latest"},
		})
		calls[id] = batchCall{id: id, method: method}
		return id, nil
	}

	fixed := make(map[string]int)
	for _, method := range []string{
		"owner", "tee", "status", "policyCommitment", "encryptedPolicy",
		"policyVersion", "balance", "nonce", "xrplPayout",
	} {
		id, err := addCall(vault, method)
		if err != nil {
			return Snapshot{}, err
		}
		fixed[method] = id
	}

	spentByDay := make(map[uint64]int)
	priceID := 0
	if includeDecisionData {
		hostUnix := c.now().Unix()
		if hostUnix < 0 {
			return Snapshot{}, fmt.Errorf("host clock is before the Unix epoch")
		}
		hostDay := uint64(hostUnix) / 86_400
		candidateDays := []uint64{hostDay}
		if hostDay > 0 {
			candidateDays = append(candidateDays, hostDay-1)
		}
		candidateDays = append(candidateDays, hostDay+1)
		for _, day := range candidateDays {
			id, err := addCall(vault, "spentUsdByDay", day)
			if err != nil {
				return Snapshot{}, err
			}
			spentByDay[day] = id
		}
		var err error
		priceID, err = addCall(c.ftso, "getFeedById", xrpUSDFeedID)
		if err != nil {
			return Snapshot{}, err
		}
	}

	body, err := json.Marshal(requests)
	if err != nil {
		return Snapshot{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return Snapshot{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return Snapshot{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Snapshot{}, fmt.Errorf("rpc status: %s", res.Status)
	}
	var batch []rpcResponse
	if err := json.NewDecoder(res.Body).Decode(&batch); err != nil {
		return Snapshot{}, err
	}
	responses := make(map[int]rpcResponse, len(batch))
	for _, response := range batch {
		if _, duplicate := responses[response.ID]; duplicate {
			return Snapshot{}, fmt.Errorf("rpc: duplicate response id %d", response.ID)
		}
		responses[response.ID] = response
	}
	if len(responses) != len(requests) {
		return Snapshot{}, fmt.Errorf("rpc: received %d of %d batch responses", len(responses), len(requests))
	}

	blockResponse, ok := responses[1]
	if !ok {
		return Snapshot{}, fmt.Errorf("rpc: latest block response is missing")
	}
	if blockResponse.Error != nil {
		return Snapshot{}, fmt.Errorf("rpc: latest block: %s", blockResponse.Error.Message)
	}
	var block struct {
		Timestamp string `json:"timestamp"`
	}
	if err := json.Unmarshal(blockResponse.Result, &block); err != nil {
		return Snapshot{}, fmt.Errorf("rpc: decode latest block: %w", err)
	}
	chainTimestamp, err := strconv.ParseUint(strings.TrimPrefix(block.Timestamp, "0x"), 16, 64)
	if err != nil || block.Timestamp == "" {
		return Snapshot{}, fmt.Errorf("rpc: invalid latest block timestamp")
	}

	decoded := make(map[int][]any, len(calls))
	for id, call := range calls {
		response, ok := responses[id]
		if !ok {
			return Snapshot{}, fmt.Errorf("rpc: %s response is missing", call.method)
		}
		if response.Error != nil {
			return Snapshot{}, fmt.Errorf("read %s: rpc: %s", call.method, response.Error.Message)
		}
		var encoded string
		if err := json.Unmarshal(response.Result, &encoded); err != nil {
			return Snapshot{}, fmt.Errorf("read %s: decode result: %w", call.method, err)
		}
		raw, err := hex.DecodeString(strings.TrimPrefix(encoded, "0x"))
		if err != nil {
			return Snapshot{}, fmt.Errorf("read %s: decode hex: %w", call.method, err)
		}
		values, err := c.abi.Unpack(call.method, raw)
		if err != nil {
			return Snapshot{}, fmt.Errorf("read %s: unpack: %w", call.method, err)
		}
		decoded[id] = values
	}
	one := func(method string) (any, error) {
		values := decoded[fixed[method]]
		if len(values) != 1 {
			return nil, fmt.Errorf("read %s: expected one output", method)
		}
		return values[0], nil
	}
	owner, err := one("owner")
	if err != nil {
		return Snapshot{}, err
	}
	tee, err := one("tee")
	if err != nil {
		return Snapshot{}, err
	}
	status, err := one("status")
	if err != nil {
		return Snapshot{}, err
	}
	commitment, err := one("policyCommitment")
	if err != nil {
		return Snapshot{}, err
	}
	ciphertext, err := one("encryptedPolicy")
	if err != nil {
		return Snapshot{}, err
	}
	version, err := one("policyVersion")
	if err != nil {
		return Snapshot{}, err
	}
	balance, err := one("balance")
	if err != nil {
		return Snapshot{}, err
	}
	nonce, err := one("nonce")
	if err != nil {
		return Snapshot{}, err
	}
	payout, err := one("xrplPayout")
	if err != nil {
		return Snapshot{}, err
	}
	state := VaultState{
		Owner: owner.(common.Address), Tee: tee.(common.Address), Status: status.(uint8),
		PolicyCommitment: commitment.([32]byte), EncryptedPolicy: ciphertext.([]byte),
		PolicyVersion: version.(uint64), Balance: balance.(*big.Int), Nonce: nonce.(*big.Int),
		SpentTodayUSD: new(big.Int), XrplPayout: payout.(string),
	}
	snapshot := Snapshot{Timestamp: chainTimestamp, Vault: state}
	if !includeDecisionData {
		return snapshot, nil
	}
	spentID, ok := spentByDay[chainTimestamp/86_400]
	if !ok {
		return Snapshot{}, fmt.Errorf("canonical Flare day is outside the prefetched safety window")
	}
	spentValues := decoded[spentID]
	if len(spentValues) != 1 {
		return Snapshot{}, fmt.Errorf("read spentUsdByDay: expected one output")
	}
	snapshot.Vault.SpentTodayUSD = spentValues[0].(*big.Int)
	price := decoded[priceID]
	if len(price) != 3 {
		return Snapshot{}, fmt.Errorf("read getFeedById: expected three outputs")
	}
	value := price[0].(*big.Int)
	if !value.IsUint64() {
		return Snapshot{}, fmt.Errorf("FTSO value does not fit uint64")
	}
	decimals := price[1].(int8)
	if decimals < 0 {
		return Snapshot{}, fmt.Errorf("FTSO decimals are negative")
	}
	snapshot.PriceValue = value.Uint64()
	snapshot.PriceDecimals = uint8(decimals)
	snapshot.PriceTimestamp = price[2].(uint64)
	return snapshot, nil
}

// LatestTimestamp returns the canonical clock used by the vault itself. Policy
// day boundaries, authorization deadlines, and price freshness must be based
// on Flare block time rather than the TEE host's wall clock.
func (c *Chain) LatestTimestamp(ctx context.Context) (uint64, error) {
	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "eth_getBlockByNumber",
		"params": []any{"latest", false},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("rpc status: %s", res.Status)
	}
	var envelope struct {
		Result *struct {
			Timestamp string `json:"timestamp"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return 0, err
	}
	if envelope.Error != nil {
		return 0, fmt.Errorf("rpc: %s", envelope.Error.Message)
	}
	if envelope.Result == nil || envelope.Result.Timestamp == "" {
		return 0, fmt.Errorf("rpc: latest block has no timestamp")
	}
	timestamp, err := strconv.ParseUint(strings.TrimPrefix(envelope.Result.Timestamp, "0x"), 16, 64)
	if err != nil {
		return 0, fmt.Errorf("rpc: invalid block timestamp: %w", err)
	}
	return timestamp, nil
}

func (c *Chain) Vault(ctx context.Context, vault common.Address, day uint64) (VaultState, error) {
	owner, err := c.one(ctx, vault, "owner")
	if err != nil {
		return VaultState{}, err
	}
	tee, err := c.one(ctx, vault, "tee")
	if err != nil {
		return VaultState{}, err
	}
	status, err := c.one(ctx, vault, "status")
	if err != nil {
		return VaultState{}, err
	}
	commitment, err := c.one(ctx, vault, "policyCommitment")
	if err != nil {
		return VaultState{}, err
	}
	ciphertext, err := c.one(ctx, vault, "encryptedPolicy")
	if err != nil {
		return VaultState{}, err
	}
	version, err := c.one(ctx, vault, "policyVersion")
	if err != nil {
		return VaultState{}, err
	}
	balance, err := c.one(ctx, vault, "balance")
	if err != nil {
		return VaultState{}, err
	}
	nonce, err := c.one(ctx, vault, "nonce")
	if err != nil {
		return VaultState{}, err
	}
	spent, err := c.one(ctx, vault, "spentUsdByDay", day)
	if err != nil {
		return VaultState{}, err
	}
	payout, err := c.one(ctx, vault, "xrplPayout")
	if err != nil {
		return VaultState{}, err
	}

	return VaultState{
		Owner: owner.(common.Address), Tee: tee.(common.Address), Status: status.(uint8),
		PolicyCommitment: commitment.([32]byte), EncryptedPolicy: ciphertext.([]byte),
		PolicyVersion: version.(uint64), Balance: balance.(*big.Int), Nonce: nonce.(*big.Int),
		SpentTodayUSD: spent.(*big.Int), XrplPayout: payout.(string),
	}, nil
}

func (c *Chain) Price(ctx context.Context) (value uint64, decimals uint8, timestamp uint64, err error) {
	out, err := c.call(ctx, c.ftso, "getFeedById", xrpUSDFeedID)
	if err != nil {
		return 0, 0, 0, err
	}
	v := out[0].(*big.Int)
	if !v.IsUint64() {
		return 0, 0, 0, fmt.Errorf("FTSO value does not fit uint64")
	}
	d := out[1].(int8)
	if d < 0 {
		return 0, 0, 0, fmt.Errorf("FTSO decimals are negative")
	}
	return v.Uint64(), uint8(d), out[2].(uint64), nil
}

func (c *Chain) one(ctx context.Context, to common.Address, method string, args ...any) (any, error) {
	out, err := c.call(ctx, to, method, args...)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", method, err)
	}
	if len(out) != 1 {
		return nil, fmt.Errorf("read %s: expected one output", method)
	}
	return out[0], nil
}

func (c *Chain) call(ctx context.Context, to common.Address, method string, args ...any) ([]any, error) {
	data, err := c.abi.Pack(method, args...)
	if err != nil {
		return nil, fmt.Errorf("pack %s: %w", method, err)
	}
	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "eth_call",
		"params": []any{map[string]string{"to": to.Hex(), "data": "0x" + hex.EncodeToString(data)}, "latest"},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.rpcURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rpc status: %s", res.Status)
	}
	var envelope struct {
		Result string `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return nil, err
	}
	if envelope.Error != nil {
		return nil, fmt.Errorf("rpc: %s", envelope.Error.Message)
	}
	raw, err := hex.DecodeString(strings.TrimPrefix(envelope.Result, "0x"))
	if err != nil {
		return nil, err
	}
	return c.abi.Unpack(method, raw)
}

func mustFeedID(raw string) [21]byte {
	b, err := hex.DecodeString(raw)
	if err != nil || len(b) != 21 {
		panic("invalid XRP/USD feed id")
	}
	var result [21]byte
	copy(result[:], b)
	return result
}
