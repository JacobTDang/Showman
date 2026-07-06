//go:build e2e || e2e_live

// Shared plumbing for the D1 offline eval (eval_e2e_test.go, tag "e2e") and the D2
// live eval (eval_live_test.go, tag "e2e_live"): both boot the real production engine
// entrypoint and drive it over real HTTP, differing only in which planner/selector
// tier the orchestrator runs and what they assert about the result.
package orchestrator

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// findRepoRoot walks up from the working directory to find package.json (the repo
// root, one level above orchestrator/).
func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 6; i++ {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("could not find repo root (package.json) above " + dir)
	return ""
}

var listeningRe = regexp.MustCompile(`listening on :(\d+)`)

// startEngine spawns the real production worker entrypoint (node --import tsx/esm
// worker.ts) exactly as test/integration/e2eWorker.test.ts does on the TS side, waits
// for its "listening on :<port>" log line, and returns the bound port. The engine
// itself never consumes OPENROUTER_API_KEY/ANTHROPIC_API_KEY (only the orchestrator,
// in-process in the same test binary, does for the D2 live eval) — they're stripped
// here anyway so the engine's own authoring path stays offline/deterministic in both
// eval variants.
func startEngine(t *testing.T, repoRoot, dataDir string) int {
	t.Helper()
	workerEntry := filepath.Join(repoRoot, "src", "service", "worker.ts")
	cmd := exec.Command("node", "--import", "tsx/esm", workerEntry)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "PORT=0", "SHOWMAN_DATA_DIR="+dataDir)
	cmd.Env = filterEnv(cmd.Env, "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	})

	portCh := make(chan int, 1)
	go func() {
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			line := sc.Text()
			fmt.Println("[engine]", line)
			if m := listeningRe.FindStringSubmatch(line); m != nil {
				if p, err := strconv.Atoi(m[1]); err == nil {
					portCh <- p
					return
				}
			}
		}
	}()

	select {
	case p := <-portCh:
		waitHealthy(t, p, 30*time.Second)
		return p
	case <-time.After(30 * time.Second):
		t.Fatal("engine did not report a listening port in time")
		return 0
	}
}

func waitHealthy(t *testing.T, port int, timeout time.Duration) {
	t.Helper()
	url := fmt.Sprintf("http://127.0.0.1:%d/healthz", port)
	end := time.Now().Add(timeout)
	for {
		if res, err := http.Get(url); err == nil {
			_ = res.Body.Close()
			if res.StatusCode == 200 {
				return
			}
		}
		if time.Now().After(end) {
			t.Fatalf("engine never became healthy at %s", url)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func filterEnv(env []string, drop ...string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		skip := false
		for _, d := range drop {
			if strings.HasPrefix(kv, d+"=") {
				skip = true
				break
			}
		}
		if !skip {
			out = append(out, kv)
		}
	}
	return out
}

func pollJobDone(t *testing.T, ts *httptest.Server, jobID string, deadline time.Duration) JobView {
	t.Helper()
	end := time.Now().Add(deadline)
	var view JobView
	for {
		res, err := ts.Client().Get(ts.URL + "/v1/jobs/" + jobID)
		if err != nil {
			t.Fatal(err)
		}
		_ = json.NewDecoder(res.Body).Decode(&view)
		_ = res.Body.Close()
		if view.Status == PhaseDone || view.Status == PhaseError {
			return view
		}
		if time.Now().After(end) {
			t.Fatalf("job %s did not finish in time; last view: %+v", jobID, view)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// assertFtyp reads the first bytes of an MP4 file and checks for a valid ftyp box
// (bytes 4-7 spell "ftyp" in a standard ISO base media file).
func assertFtyp(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open video %q: %w", path, err)
	}
	defer f.Close()
	head := make([]byte, 12)
	if _, err := f.Read(head); err != nil {
		return fmt.Errorf("read video %q: %w", path, err)
	}
	if string(head[4:8]) != "ftyp" {
		return fmt.Errorf("video %q missing ftyp box: %x", path, head)
	}
	return nil
}
