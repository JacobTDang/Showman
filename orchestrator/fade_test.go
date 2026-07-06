package orchestrator

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// TestStitchFadeTransitionCrossfadesThreeClips is Roadmap E2's stated acceptance
// bar: a 3-clip fade probe where both streams stay intact and the final duration is
// approximately the sum of clip durations minus the transition overlaps.
func TestStitchFadeTransitionCrossfadesThreeClips(t *testing.T) {
	requireTool(t, "ffmpeg")
	requireTool(t, "ffprobe")
	dir := t.TempDir()
	for i, seconds := range []float64{2.0, 2.0, 2.0} {
		makeTestClipWithAudio(t, dir, fmt.Sprintf("clip-%d.mp4", i), seconds)
	}

	s := &JobContext{
		JobID:   "job-fade",
		Request: ExternalRequest{Options: GenerateVideoOptions{Transition: "fade"}},
		Scenes: []SceneState{
			{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-0.mp4"}, DurationSec: 2}},
			{Index: 1, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-1.mp4"}, DurationSec: 2}},
			{Index: 2, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "clip-2.mp4"}, DurationSec: 2}},
		},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out")}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}

	// Streams intact: exactly one video + one audio stream survive the crossfade.
	probe := exec.Command("ffprobe", "-v", "error",
		"-show_entries", "format=duration:stream=codec_type",
		"-of", "default=noprint_wrappers=1", final.VideoKey)
	out, err := probe.CombinedOutput()
	if err != nil {
		t.Fatalf("ffprobe: %v\n%s", err, out)
	}
	text := string(out)
	if strings.Count(text, "codec_type=video") != 1 || strings.Count(text, "codec_type=audio") != 1 {
		t.Fatalf("expected exactly one video + one audio stream after crossfade:\n%s", text)
	}

	// Duration ~= sum(2,2,2) - 2*0.5 overlap = 5.0s (two transitions between three clips).
	m := regexp.MustCompile(`duration=([0-9.]+)`).FindStringSubmatch(text)
	if m == nil {
		t.Fatalf("no duration in probe output:\n%s", text)
	}
	dur, _ := strconv.ParseFloat(m[1], 64)
	if diff := dur - 5.0; diff < -0.3 || diff > 0.3 {
		t.Fatalf("fade-stitched duration %.2fs far from expected ~5.0s (3x2s clips, 2 overlaps of 0.5s)", dur)
	}
	if final.DurationSec < 4.7 || final.DurationSec > 5.3 {
		t.Fatalf("FinalAssembly.DurationSec %.2f far from expected ~5.0s", final.DurationSec)
	}
	if len(final.SceneOffsets) != 3 || final.SceneOffsets[0] != 0 {
		t.Fatalf("scene offsets wrong: %v", final.SceneOffsets)
	}
}

// TestStitchFadeSingleClipIsAPassthrough: one clip has nothing to crossfade with —
// the fade path must still produce a valid, playable output.
func TestStitchFadeSingleClipIsAPassthrough(t *testing.T) {
	requireTool(t, "ffmpeg")
	dir := t.TempDir()
	makeTestClipWithAudio(t, dir, "solo.mp4", 1.5)

	s := &JobContext{
		JobID:   "job-fade-solo",
		Request: ExternalRequest{Options: GenerateVideoOptions{Transition: "fade"}},
		Scenes:  []SceneState{{Index: 0, Render: &SceneRender{Status: RenderDone, Clip: &ObjectRef{Key: "solo.mp4"}, DurationSec: 1.5}}},
	}
	st := &FFmpegStitcher{Fetcher: &fileFetcher{dir: dir}, OutDir: filepath.Join(dir, "out")}
	final, err := st.Stitch(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if final.DurationSec < 1.3 || final.DurationSec > 1.7 {
		t.Fatalf("single-clip fade passthrough duration wrong: %.2f", final.DurationSec)
	}
}
