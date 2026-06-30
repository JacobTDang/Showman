module showman/orchestrator

// 1.24 (not 1.26) to match control-plane: golangci-lint refuses a module targeting a
// newer Go than its own build. This scaffold (Phase G0) uses only the standard library;
// the Eino dependency is added when the graph is wired (Phase G1).
go 1.24
