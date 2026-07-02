package orchestrator

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// makeTestClip renders a short solid-color MP4 with ffmpeg (same encoder profile for
// every clip, mirroring the engine's uniform per-job settings).
func makeTestClip(t *testing.T, dir, name, color string, seconds float64) string {
	t.Helper()
	out := filepath.Join(dir, name)
	cmd := exec.Command("ffmpeg", "-y",
		"-f", "lavfi", "-i", fmt.Sprintf("color=c=%s:s=64x64:r=10:d=%g", color, seconds),
		"-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
		out,
	)
	if o, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("make clip: %v\n%s", err, o)
	}
	return out
}

// fileFetcher serves clips from a local directory keyed by file name.
type fileFetcher struct{ dir string }

func (f *fileFetcher) FetchObject(_ context.Context, key string) ([]byte, error) {
	return os.ReadFile(filepath.Join(f.dir, key))
}

func TestFFmpegStitcherConcatenatesClips(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not available")
	}
	dir := t.TempDir()
	makeTestClip(t, dir, "a.mp4", "red", 1)
	makeTestClip(t, dir, "b.mp4", "blue", 1)

	s := &JobContext{
		JobID: "job-stitch",
		Scenes: []SceneState{
			{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "a.mp4"}, DurationSec: 1}},
			{Index: 1, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "b.mp4"}, DurationSec: 1}},
		},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out")}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(final.VideoKey)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 || !bytes.Equal(data[4:8], []byte("ftyp")) {
		t.Fatalf("output is not a valid MP4 (size %d)", len(data))
	}
	if final.DurationSec != 2 || len(final.SceneOffsets) != 2 || final.SceneOffsets[1] != 1 {
		t.Fatalf("assembly metadata wrong: %+v", final)
	}
}

// makeTestClipWithAudio renders a clip carrying BOTH streams (color video + sine
// audio, AAC), mirroring what the engine emits for narrated scenes.
func makeTestClipWithAudio(t *testing.T, dir, name string, seconds float64) {
	t.Helper()
	out := filepath.Join(dir, name)
	cmd := exec.Command("ffmpeg", "-y",
		"-f", "lavfi", "-i", fmt.Sprintf("color=c=green:s=64x64:r=10:d=%g", seconds),
		"-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=440:duration=%g", seconds),
		"-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-shortest",
		out,
	)
	if o, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("make a/v clip: %v\n%s", err, o)
	}
}

// The P4 risk item, measured: stream-copy concat of audio-bearing clips must keep
// both streams and must not drift (container duration ≈ sum of clip durations).
func TestStitchKeepsAVInSyncAcrossConcat(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not available")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("ffprobe not available")
	}
	dir := t.TempDir()
	for i := 0; i < 3; i++ {
		makeTestClipWithAudio(t, dir, fmt.Sprintf("clip-%d.mp4", i), 1.0)
	}
	s := &JobContext{
		JobID: "job-av",
		Scenes: []SceneState{
			{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-0.mp4"}, DurationSec: 1}},
			{Index: 1, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-1.mp4"}, DurationSec: 1}},
			{Index: 2, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-2.mp4"}, DurationSec: 1}},
		},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out")}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}

	// Probe the result: exactly 2 streams (v+a), duration within 120ms of 3.0s
	// (AAC priming adds a few tens of ms per file; drift beyond that = broken sync).
	probe := exec.Command("ffprobe", "-v", "error",
		"-show_entries", "format=duration:stream=codec_type",
		"-of", "default=noprint_wrappers=1", final.VideoKey)
	out, err := probe.CombinedOutput()
	if err != nil {
		t.Fatalf("ffprobe: %v\n%s", err, out)
	}
	text := string(out)
	if strings.Count(text, "codec_type=video") != 1 || strings.Count(text, "codec_type=audio") != 1 {
		t.Fatalf("expected exactly one video + one audio stream:\n%s", text)
	}
	m := regexp.MustCompile(`duration=([0-9.]+)`).FindStringSubmatch(text)
	if m == nil {
		t.Fatalf("no duration in probe output:\n%s", text)
	}
	dur, _ := strconv.ParseFloat(m[1], 64)
	if diff := dur - 3.0; diff < -0.12 || diff > 0.12 {
		t.Fatalf("A/V concat drift: container duration %.3fs vs expected 3.0s", dur)
	}
}

func TestFFmpegStitcherErrorsOnMissingClip(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not available")
	}
	s := &JobContext{JobID: "job-x", Scenes: []SceneState{{Index: 0}}}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: t.TempDir()}, OutDir: t.TempDir()}
	if _, err := st.Stitch(context.Background(), s); err == nil {
		t.Fatal("expected error for scene without a rendered clip")
	}
}
