package config

import "time"

const (
	// Version is reported with every result and mixed into the state hash, so
	// a change to what this extension does is visible to anyone reading it.
	Version = "3.0.0"

	// OPTypeCovenant and its commands are the instruction vocabulary. The
	// contract's callers name these; anything else is refused as unsupported
	// rather than guessed at.
	OPTypeCovenant             = "COVENANT"
	OPCommandAuthorizeSpend    = "AUTHORIZE_SPEND"
	OPCommandAuthorizeWithdraw = "AUTHORIZE_WITHDRAW"
	OPCommandAuthorizeRedeem   = "AUTHORIZE_REDEEM"
	OPCommandAuthorizeAdmin    = "AUTHORIZE_ADMIN"

	ExtensionPort = 8080
	SignPort      = 8081

	TimeoutShutdown = 10 * time.Second
)
