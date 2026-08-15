// dump-tee-abi: print the MachineManager ABI published in Flare's Go SDK.
//
// Flare ships no TypeScript package for the Confidential Compute contracts, so
// the browser-side TEE registry ABI is extracted from the same
// go-flare-common bindings the extension tooling already builds against.
// That keeps one upstream source of truth instead of a hand-written fragment.
//
// Usage: go run ./cmd/dump-tee-abi > ../../packages/sdk/abi/machinemanager.json
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/flare-foundation/go-flare-common/pkg/contracts/tee/machinemanager"
)

func main() {
	var abi []json.RawMessage
	if err := json.Unmarshal([]byte(machinemanager.MachineManagerMetaData.ABI), &abi); err != nil {
		fmt.Fprintf(os.Stderr, "decode MachineManager ABI: %v\n", err)
		os.Exit(1)
	}

	encoded, err := json.MarshalIndent(abi, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "encode ABI: %v\n", err)
		os.Exit(1)
	}
	if _, err := os.Stdout.Write(append(encoded, '\n')); err != nil {
		fmt.Fprintf(os.Stderr, "write ABI: %v\n", err)
		os.Exit(1)
	}
}
