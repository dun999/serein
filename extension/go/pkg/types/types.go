// Package types defines Covenant's FCC wire responses.
package types

type AuthorizationResponse struct {
	Tee            string `json:"tee"`
	Authorization  string `json:"authorization"`
	Digest         string `json:"digest"`
	Nonce          string `json:"nonce"`
	Deadline       uint64 `json:"deadline"`
	AmountUSD      string `json:"amountUsd,omitempty"`
	PriceTimestamp uint64 `json:"priceTimestamp,omitempty"`
	PolicyVersion  uint64 `json:"policyVersion"`
	Operation      uint8  `json:"operation"`
	AdminAction    *uint8 `json:"adminAction,omitempty"`
	PayloadHash    string `json:"payloadHash,omitempty"`
	XrplPayout     string `json:"xrplPayout,omitempty"`
}

type State struct {
	Tee             string `json:"tee"`
	ChainID         uint64 `json:"chainId"`
	PolicyPublicKey string `json:"policyPublicKey"`
	Authorizations  int    `json:"authorizations"`
	Refusals        int    `json:"refusals"`
}

type StateResponse struct {
	StateVersion [32]byte `json:"stateVersion"`
	State        State    `json:"state"`
}
