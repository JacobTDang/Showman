package orchestrator

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
