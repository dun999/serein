// Package main provides a combined entry point for Docker that starts both the
// tee-node server and the extension in a single process. Unlike tools/cmd/start-tee,
// this avoids importing extension-e2e — Docker sets PROXY_URL as an env var which
// tee-node reads directly via settings.init().
package main

import (
	"covenant-fcc/internal/privatevault"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/flare-foundation/go-flare-common/pkg/logger"
	teeServer "github.com/flare-foundation/tee-node/pkg/server"

	"covenant-fcc/internal/config"
	extserver "covenant-fcc/pkg/server"
)

func main() {
	configPort := intEnv("CONFIG_PORT", 5501)
	signPort := intEnv("SIGN_PORT", config.SignPort)
	extensionPort := intEnv("EXTENSION_PORT", config.ExtensionPort)

	// The policy engine deliberately signs through tee-node's loopback service,
	// so the registered machine identity—not an adjacent app key—authorizes the
	// vault. Start tee-node before resolving that identity.
	go teeServer.StartServerExtension(configPort, signPort, extensionPort)
	time.Sleep(300 * time.Millisecond)

	covenantEnclave, enclaveErr := privatevault.FromEnv()
	if enclaveErr != nil {
		panic(enclaveErr)
	}

	// Start extension server — fail fast if port binding fails.
	extErrCh := extserver.StartExtension(extensionPort, signPort, covenantEnclave)

	// Give server a moment to bind, then check for early failures.
	time.Sleep(100 * time.Millisecond)
	select {
	case err := <-extErrCh:
		logger.Fatalf("extension server failed to start: %v", err)
	default:
	}

	logger.Infof("extension TEE running (config=%d, sign=%d, ext=%d)", configPort, signPort, extensionPort)

	// Wait for signal or server error.
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	select {
	case <-sigChan:
		logger.Info("shutting down")
	case err := <-extErrCh:
		logger.Fatalf("extension server error: %v", err)
	}
}

func intEnv(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return v
	}
	return fallback
}
