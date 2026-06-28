module showman/controlplane

// 1.24 (not 1.26): golangci-lint isn't built with Go 1.26 yet and refuses a module
// targeting a newer Go than its own build. Only stdlib net/http 1.22+ features are used.
go 1.24
