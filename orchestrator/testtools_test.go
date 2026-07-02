package orchestrator

import (
	"os"
	"os/exec"
	"testing"
)

// requireTool gates a test on an external binary with a CI-aware policy: on a dev box
// without the tool the test SKIPS (convenience); in CI it FAILS — a runner missing
// ffmpeg must go red, never silently green. Mirrors the TS suite's expect.unreachable
// stance (GitHub Actions always sets CI=true).
func requireTool(t *testing.T, tool string) {
	t.Helper()
	if _, err := exec.LookPath(tool); err == nil {
		return
	}
	if os.Getenv("CI") != "" {
		t.Fatalf("%s is required in CI but not installed on this runner", tool)
	}
	t.Skipf("%s not available (skipping locally; would FAIL in CI)", tool)
}
