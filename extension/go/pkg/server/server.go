package server

import (
	extension "covenant-fcc/internal/extension"
	"covenant-fcc/internal/privatevault"
)

// StartExtension starts the extension server in a goroutine.
// Returns an error channel that receives any ListenAndServe failure
// (for example, the port already being in use).
func StartExtension(extensionPort, signPort int, e *privatevault.Engine) <-chan error {
	ext := extension.New(extensionPort, signPort, e)
	errCh := make(chan error, 1)
	go func() {
		if err := ext.Server.ListenAndServe(); err != nil {
			errCh <- err
		}
	}()
	return errCh
}
