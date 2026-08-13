package privatevault

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

func TestLatestTimestampUsesFlareBlockTime(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.Method != "eth_getBlockByNumber" {
			t.Fatalf("unexpected RPC method %q", request.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"timestamp":"0x6553f100"}}`))
	}))
	defer server.Close()

	chain, err := NewChain(server.URL, common.Address{}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	timestamp, err := chain.LatestTimestamp(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if timestamp != 1_700_000_000 {
		t.Fatalf("timestamp = %d, want 1700000000", timestamp)
	}
}

func TestSnapshotBatchesAuthorizationReadsAndAcceptsUnorderedResponses(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(readABI))
	if err != nil {
		t.Fatal(err)
	}
	const chainTimestamp = uint64(1_700_000_000)
	chainDay := chainTimestamp / 86_400
	vault := common.HexToAddress("0x000000000000000000000000000000000000c0de")
	owner := common.HexToAddress("0x0000000000000000000000000000000000000a11")
	tee := common.HexToAddress("0x00000000000000000000000000000000000007ee")
	commitment := common.HexToHash("0x1234")
	requestsSeen := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestsSeen++
		var requests []rpcRequest
		if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
			t.Fatal(err)
		}
		if len(requests) != 14 {
			t.Fatalf("batch request count = %d, want 14", len(requests))
		}
		responses := make([]map[string]any, 0, len(requests))
		for _, request := range requests {
			if request.Method == "eth_getBlockByNumber" {
				responses = append(responses, map[string]any{
					"jsonrpc": "2.0", "id": request.ID,
					"result": map[string]string{"timestamp": fmt.Sprintf("0x%x", chainTimestamp)},
				})
				continue
			}
			call := request.Params[0].(map[string]any)
			data, err := hex.DecodeString(strings.TrimPrefix(call["data"].(string), "0x"))
			if err != nil {
				t.Fatal(err)
			}
			method, err := parsed.MethodById(data[:4])
			if err != nil {
				t.Fatal(err)
			}
			var values []any
			switch method.Name {
			case "owner":
				values = []any{owner}
			case "tee":
				values = []any{tee}
			case "status":
				values = []any{uint8(0)}
			case "policyCommitment":
				values = []any{commitment}
			case "encryptedPolicy":
				values = []any{[]byte{0xca, 0xfe}}
			case "policyVersion":
				values = []any{uint64(4)}
			case "balance":
				values = []any{big.NewInt(9_800_000)}
			case "nonce":
				values = []any{big.NewInt(7)}
			case "xrplPayout":
				values = []any{"rnVmbu8wUD28mqwn88KsB8vATTMLkZn5p5"}
			case "spentUsdByDay":
				inputs, unpackErr := method.Inputs.Unpack(data[4:])
				if unpackErr != nil {
					t.Fatal(unpackErr)
				}
				spent := int64(0)
				if inputs[0].(uint64) == chainDay {
					spent = 42
				}
				values = []any{big.NewInt(spent)}
			case "getFeedById":
				values = []any{big.NewInt(250_000), int8(5), chainTimestamp - 10}
			default:
				t.Fatalf("unexpected contract read %q", method.Name)
			}
			encoded, err := method.Outputs.Pack(values...)
			if err != nil {
				t.Fatal(err)
			}
			responses = append(responses, map[string]any{
				"jsonrpc": "2.0", "id": request.ID, "result": "0x" + hex.EncodeToString(encoded),
			})
		}
		// JSON-RPC batch responses may arrive in any order.
		sort.Slice(responses, func(i, j int) bool {
			return responses[i]["id"].(int) > responses[j]["id"].(int)
		})
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(responses); err != nil {
			t.Fatal(err)
		}
	}))
	defer server.Close()

	chain, err := NewChain(server.URL, common.HexToAddress("0x000000000000000000000000000000000000f750"), server.Client())
	if err != nil {
		t.Fatal(err)
	}
	chain.now = func() time.Time { return time.Unix(int64(chainTimestamp), 0) }
	snapshot, err := chain.Snapshot(context.Background(), vault, true)
	if err != nil {
		t.Fatal(err)
	}
	if requestsSeen != 1 {
		t.Fatalf("HTTP request count = %d, want one JSON-RPC batch", requestsSeen)
	}
	if snapshot.Timestamp != chainTimestamp || snapshot.Vault.Owner != owner || snapshot.Vault.Tee != tee {
		t.Fatalf("unexpected snapshot identity: %+v", snapshot)
	}
	if snapshot.Vault.SpentTodayUSD.Cmp(big.NewInt(42)) != 0 {
		t.Fatalf("spent today = %s, want 42", snapshot.Vault.SpentTodayUSD)
	}
	if snapshot.PriceValue != 250_000 || snapshot.PriceDecimals != 5 || snapshot.PriceTimestamp != chainTimestamp-10 {
		t.Fatalf("unexpected price snapshot: %+v", snapshot)
	}
}

func TestSnapshotFailsClosedWhenHostDayCannotCoverFlareDay(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(readABI))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var requests []rpcRequest
		if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
			t.Fatal(err)
		}
		responses := make([]map[string]any, 0, len(requests))
		for _, request := range requests {
			if request.Method == "eth_getBlockByNumber" {
				responses = append(responses, map[string]any{
					"jsonrpc": "2.0", "id": request.ID,
					"result": map[string]string{"timestamp": "0x6553f100"},
				})
				continue
			}
			call := request.Params[0].(map[string]any)
			data, decodeErr := hex.DecodeString(strings.TrimPrefix(call["data"].(string), "0x"))
			if decodeErr != nil {
				t.Fatal(decodeErr)
			}
			method, methodErr := parsed.MethodById(data[:4])
			if methodErr != nil {
				t.Fatal(methodErr)
			}
			values := zeroOutputs(method.Name)
			encoded, packErr := method.Outputs.Pack(values...)
			if packErr != nil {
				t.Fatal(packErr)
			}
			responses = append(responses, map[string]any{
				"jsonrpc": "2.0", "id": request.ID, "result": "0x" + hex.EncodeToString(encoded),
			})
		}
		_ = json.NewEncoder(w).Encode(responses)
	}))
	defer server.Close()

	chain, err := NewChain(server.URL, common.Address{}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	chain.now = func() time.Time { return time.Unix(1_000_000, 0) }
	_, err = chain.Snapshot(context.Background(), common.HexToAddress("0xc0de"), true)
	if err == nil || !strings.Contains(err.Error(), "outside the prefetched safety window") {
		t.Fatalf("error = %v, want fail-closed policy-day error", err)
	}
}

func zeroOutputs(method string) []any {
	switch method {
	case "owner", "tee":
		return []any{common.Address{}}
	case "status":
		return []any{uint8(0)}
	case "policyCommitment":
		return []any{common.Hash{}}
	case "encryptedPolicy":
		return []any{[]byte{}}
	case "policyVersion":
		return []any{uint64(0)}
	case "balance", "nonce", "spentUsdByDay":
		return []any{new(big.Int)}
	case "xrplPayout":
		return []any{""}
	case "getFeedById":
		return []any{new(big.Int), int8(0), uint64(0)}
	default:
		panic("unexpected method: " + method)
	}
}

func TestLiveAuthorizationSnapshotCompletesInsideFCCBudget(t *testing.T) {
	rpcURL := os.Getenv("LIVE_COSTON2_RPC_URL")
	if rpcURL == "" {
		t.Skip("set LIVE_COSTON2_RPC_URL to run the Coston2 latency check")
	}
	vaultRaw := os.Getenv("LIVE_VAULT_ADDRESS")
	if !common.IsHexAddress(vaultRaw) {
		t.Fatal("LIVE_VAULT_ADDRESS must be a valid address")
	}
	client := &http.Client{Timeout: 2 * time.Second}
	chain, err := NewChain(
		rpcURL,
		common.HexToAddress("0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d"),
		client,
	)
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	if _, err := chain.Snapshot(context.Background(), common.HexToAddress(vaultRaw), true); err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(started); elapsed >= 2*time.Second {
		t.Fatalf("authorization snapshot took %s, outside FCC's two-second budget", elapsed)
	} else {
		t.Logf("authorization snapshot completed in %s", elapsed)
	}
}
