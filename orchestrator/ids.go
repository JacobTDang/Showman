package orchestrator

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// RequestHash is the canonical dedup hash of a request. Go marshals a struct in fixed field
// order, so the encoding is deterministic for the same value.
func RequestHash(req ExternalRequest) (string, error) {
	b, err := json.Marshal(req)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}

// RootSeed derives the deterministic root seed from a request hash. The sign bit is cleared
// so the result is always a non-negative int64 (safe to write into a SceneSpec seed).
func RootSeed(requestHash string) int64 {
	sum := sha256.Sum256([]byte(requestHash))
	return int64(binary.BigEndian.Uint64(sum[:8]) >> 1)
}

// SceneSeed derives a per-scene seed from the root seed and the scene index, so the same
// request yields the same scene seeds (reproducible renders) while scenes differ.
func SceneSeed(rootSeed int64, index int) int64 {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%d", rootSeed, index)))
	return int64(binary.BigEndian.Uint64(sum[:8]) >> 1)
}
