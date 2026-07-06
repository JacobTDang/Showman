package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
)

// makeTestClipAtVolume renders a clip whose sine-wave audio sits at an EXPLICIT,
// deliberately off-target level (dB relative to full scale) — so the stitcher's
// loudnorm pass has real work to do, not a no-op on already-correct audio.
func makeTestClipAtVolume(t *testing.T, dir, name string, seconds float64, volumeDB float64) {
	t.Helper()
	out := filepath.Join(dir, name)
	cmd := exec.Command("ffmpeg", "-y",
		"-f", "lavfi", "-i", fmt.Sprintf("color=c=purple:s=64x64:r=10:d=%g", seconds),
		"-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=440:duration=%g", seconds),
		"-af", fmt.Sprintf("volume=%gdB", volumeDB),
		"-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-shortest",
		out,
	)
	if o, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("make clip at %gdB: %v\n%s", volumeDB, err, o)
	}
}

// measureIntegratedLUFS runs ffmpeg's loudnorm filter in measurement mode (a null
// output, print_format=json) and parses the integrated loudness it reports — the
// same tool/technique used to build the filter in the first place, so this is a
// real acceptance probe, not a hand-rolled approximation.
func measureIntegratedLUFS(t *testing.T, path string) float64 {
	t.Helper()
	cmd := exec.Command("ffmpeg", "-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("measure loudness: %v\n%s", err, out)
	}
	// loudnorm prints its JSON block after everything else on stderr; grab the last
	// balanced {...}.
	re := regexp.MustCompile(`(?s)\{[^{}]*"input_i"[^{}]*\}`)
	m := re.FindString(string(out))
	if m == "" {
		t.Fatalf("no loudnorm JSON in ffmpeg output:\n%s", out)
	}
	var parsed struct {
		InputI string `json:"input_i"`
	}
	if err := json.Unmarshal([]byte(m), &parsed); err != nil {
		t.Fatalf("parse loudnorm JSON: %v\n%s", err, m)
	}
	lufs, err := strconv.ParseFloat(parsed.InputI, 64)
	if err != nil {
		t.Fatalf("parse input_i %q: %v", parsed.InputI, err)
	}
	return lufs
}

// TestStitchNormalizesLoudness is Roadmap E6's acceptance bar: probe the stitched
// output's mean loudness and confirm it lands at -16±2 LUFS, even when the source
// clips are deliberately far from that target (one very quiet, one very loud) —
// proving the filter is actually doing normalization work, not passing through
// already-compliant audio.
func TestStitchNormalizesLoudness(t *testing.T) {
	requireTool(t, "ffmpeg")
	dir := t.TempDir()
	makeTestClipAtVolume(t, dir, "quiet.mp4", 2.0, -35) // way below target
	makeTestClipAtVolume(t, dir, "loud.mp4", 2.0, 0)    // full-scale sine, way above target

	s := &JobContext{
		JobID: "job-loudness",
		Scenes: []SceneState{
			{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "quiet.mp4"}, DurationSec: 2}},
			{Index: 1, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "loud.mp4"}, DurationSec: 2}},
		},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out")}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}

	lufs := measureIntegratedLUFS(t, final.VideoKey)
	if lufs < -18 || lufs > -14 {
		t.Fatalf("integrated loudness %.1f LUFS outside the -16±2 acceptance bar", lufs)
	}
}

// TestStitchLoudnessTargetIsConfigurable proves the target is a real knob (default
// applies at zero value; a caller-supplied value takes over) rather than a hardcoded
// constant string-substituted in.
func TestStitchLoudnessTargetIsConfigurable(t *testing.T) {
	requireTool(t, "ffmpeg")
	dir := t.TempDir()
	makeTestClipAtVolume(t, dir, "mid.mp4", 2.0, -20)

	s := &JobContext{
		JobID:  "job-loudness-custom",
		Scenes: []SceneState{{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "mid.mp4"}, DurationSec: 2}}},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out"), LoudnessTargetLUFS: -23}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	lufs := measureIntegratedLUFS(t, final.VideoKey)
	if lufs < -25 || lufs > -21 {
		t.Fatalf("custom target -23 LUFS not honored: measured %.1f", lufs)
	}
}
