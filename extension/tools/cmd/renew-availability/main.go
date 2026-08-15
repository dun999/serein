// renew-availability: re-extend the on-chain availability validity of an
// already-registered TEE machine.
//
// A machine's availability check is valid for roughly six hours. Once it
// lapses the machine still reads as Production, but toProduction reverts with
// InvalidTeeStatus and the deployment health check reports the expiry. The
// registry only accepts a fresh availability proof from a Paused machine, and
// the proof must be minted after the pause, so renewal is:
//
//	pause -> request attestation -> availability check -> toProduction
//
// which is exactly this tool. Intended to run unattended on a timer, well
// before the six-hour window closes.
package main

import (
	"context"
	"flag"
	"os"
	"time"

	"covenant-fcc/tools/pkg/configs"
	"covenant-fcc/tools/pkg/fccutils"
	"covenant-fcc/tools/pkg/support"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/flare-foundation/go-flare-common/pkg/logger"
)

// TeeStatus values used by the machine registry.
const (
	statusProduction = 2
	statusPaused     = 4
)

// availabilityValidity is how long a check stays valid once accepted. The
// registry has no getter for it, so validity is tracked as the last status
// change plus this window — the same derivation the deployment health check
// uses, and exact because toProduction is what sets both.
const availabilityValidity = 6 * time.Hour

func main() {
	af := flag.String("a", configs.AddressesFile, "file with deployed addresses")
	cf := flag.String("c", configs.ChainNodeURL, "chain node url")
	pf := flag.String("p", configs.ExtensionProxyURL, "extension proxy url (used to query TEE info)")
	hf := flag.String("h", "", "host url registered on-chain (defaults to -p if not set)")
	epf := flag.String("ep", "http://localhost:6662", "external proxy url (for FTDC)")
	stateFile := flag.String("state", "../config/renew-availability.state", "state file for resume support")
	minRemaining := flag.Duration("min-remaining", 2*time.Hour, "skip renewal while at least this much validity remains")
	flag.Parse()

	s, err := support.DefaultSupport(*af, *cf)
	if err != nil {
		fccutils.FatalWithCause(err)
	}

	teeInfo, err := fccutils.TeeInfo(*pf)
	if err != nil {
		fccutils.FatalWithCause(err)
	}
	teeID, _, err := fccutils.TeeProxyId(teeInfo)
	if err != nil {
		fccutils.FatalWithCause(err)
	}

	ftdcTeeID, _, err := fccutils.GetTeeProxyID(*epf)
	if err != nil {
		fccutils.FatalWithCause(err)
	}

	hostURL := *hf
	if hostURL == "" {
		hostURL = *pf
	}

	callOpts := &bind.CallOpts{Context: context.Background()}
	status, err := s.TeeMachineRegistry.GetTeeMachineStatus(callOpts, teeID)
	if err != nil {
		fccutils.FatalWithCause(err)
	}
	logger.Infof("Renewing availability for TEE %s (status %d)", teeID.Hex(), status)

	switch status {
	case statusProduction:
		// Renewal pauses the machine for a few seconds, during which it is not
		// dispatchable. Run on a short timer but only act when validity is
		// actually running low, so a failed attempt gets retried long before
		// the window closes without pausing the machine every tick.
		changedAt, err := s.TeeMachineRegistry.GetLastStatusChangeTs(callOpts, teeID)
		if err != nil {
			fccutils.FatalWithCause(err)
		}
		remaining := time.Until(time.Unix(changedAt.Int64(), 0).Add(availabilityValidity))
		if remaining > *minRemaining {
			logger.Infof("availability still valid for %s (renewing under %s), nothing to do",
				remaining.Truncate(time.Minute), *minRemaining)
			return
		}
		logger.Infof("availability valid for %s, renewing now", remaining.Truncate(time.Minute))

		if err := fccutils.PauseTeeMachine(s, teeID); err != nil {
			fccutils.FatalWithCause(err)
		}
	case statusPaused:
		// A previous renewal paused the machine and then failed before
		// promoting it. Carry on and promote it back.
		logger.Infof("machine is already paused, promoting it back")
	default:
		logger.Fatalf("cannot renew a machine in status %d; expected %d (Production) or %d (Paused)",
			status, statusProduction, statusPaused)
	}

	// Rap: fresh attestation challenge, availability check, promote. Always
	// start from a clean state file — resuming would reuse a stale one-shot
	// challenge or a stale availability instruction.
	if err := os.Remove(*stateFile); err != nil && !os.IsNotExist(err) {
		logger.Warnf("WARNING: failed to remove stale state file: %v", err)
	}
	if err := fccutils.RegisterNode(s, teeInfo, hostURL, *epf, ftdcTeeID, "Rap", "", *stateFile); err != nil {
		fccutils.FatalWithCause(err)
	}

	logger.Infof("Availability renewed for TEE %s", teeID.Hex())
}
