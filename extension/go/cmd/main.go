// Command extension runs Covenant's Confidential Compute half inside FCC.
//
// It holds the key the Covenant contract insists signed every payment, and
// decides for itself whether each one is inside the rules by reading them from
// Flare. Nothing a caller says changes what it reads, which is what makes the
// owner's key insufficient on its own.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/flare-foundation/go-flare-common/pkg/logger"

	"covenant-fcc/internal/config"
	extension "covenant-fcc/internal/extension"
	"covenant-fcc/internal/privatevault"
)

func main() {
	e, err := privatevault.FromEnv()
	if err != nil {
		logger.Fatalf("startup: %v", err)
	}

	ext := extension.New(config.ExtensionPort, config.SignPort, e)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		ctx, cancel := context.WithTimeout(context.Background(), config.TimeoutShutdown)
		defer cancel()
		if err := ext.Server.Shutdown(ctx); err != nil {
			logger.Errorf("graceful shutdown: %v", err)
		}
		os.Exit(0)
	}()

	logger.Infof("covenant FCC engine %s listening on :%d", e.Address().Hex(), config.ExtensionPort)

	err = ext.Server.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		logger.Fatalf("server: %v", err)
	}
}
