package orchestrator

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ObjectFetcher pulls stored object bytes (clips) out of the engine's object storage.
// HTTPEngineClient implements it via GET /objects/<key>.
type ObjectFetcher interface {
	FetchObject(ctx context.Context, key string) ([]byte, error)
}

// FFmpegStitcher concatenates the rendered scene clips into one MP4 using the ffmpeg
// concat demuxer with stream copy — no re-encode, byte-deterministic, always available
// because the pipeline locks one canvas (dims/fps) and one encoder profile per job.
type FFmpegStitcher struct {
	// Fetcher pulls clip bytes from the engine.
	Fetcher ObjectFetcher
	// OutDir receives the final MP4 (one file per job). Created if absent.
	OutDir string
	// FFmpegPath overrides the ffmpeg binary (default "ffmpeg").
	FFmpegPath string
}

// Stitch fetches every rendered clip, concatenates them with stream copy, and returns
// the final assembly (local file path as the video key for now; object storage comes
// with the job API).
func (f *FFmpegStitcher) Stitch(ctx context.Context, s *JobContext) (FinalAssembly, error) {
	if f.Fetcher == nil {
		return FinalAssembly{}, fmt.Errorf("stitch: no object fetcher configured")
	}
	work, err := os.MkdirTemp("", "showman-stitch-")
	if err != nil {
		return FinalAssembly{}, err
	}
	defer func() { _ = os.RemoveAll(work) }()

	// Fetch clips in scene order; compute cumulative offsets as we go.
	var listLines []string
	offsets := make([]float64, 0, len(s.Scenes))
	total := 0.0
	for _, sc := range s.Scenes {
		offsets = append(offsets, total)
		if sc.Render == nil || sc.Render.Clip == nil {
			return FinalAssembly{}, fmt.Errorf("stitch: scene %d has no rendered clip", sc.Index)
		}
		data, err := f.Fetcher.FetchObject(ctx, sc.Render.Clip.Key)
		if err != nil {
			return FinalAssembly{}, fmt.Errorf("stitch: fetch scene %d clip: %w", sc.Index, err)
		}
		name := fmt.Sprintf("clip-%03d.mp4", sc.Index)
		if err := os.WriteFile(filepath.Join(work, name), data, 0o644); err != nil {
			return FinalAssembly{}, err
		}
		listLines = append(listLines, fmt.Sprintf("file '%s'", name))
		total += sc.Render.DurationSec
	}
	listPath := filepath.Join(work, "list.txt")
	if err := os.WriteFile(listPath, []byte(strings.Join(listLines, "\n")+"\n"), 0o644); err != nil {
		return FinalAssembly{}, err
	}

	if err := os.MkdirAll(f.OutDir, 0o755); err != nil {
		return FinalAssembly{}, err
	}
	outPath := filepath.Join(f.OutDir, s.JobID+".mp4")

	bin := f.FFmpegPath
	if bin == "" {
		bin = "ffmpeg"
	}
	// Concat demuxer + stream copy: no re-encode, deterministic over the same clips.
	cmd := exec.CommandContext(ctx, bin,
		"-y", "-f", "concat", "-safe", "0", "-i", listPath,
		"-c", "copy", "-movflags", "+faststart",
		outPath,
	)
	cmd.Dir = work
	if out, err := cmd.CombinedOutput(); err != nil {
		return FinalAssembly{}, fmt.Errorf("stitch: ffmpeg concat: %w\n%s", err, truncate(string(out), 800))
	}

	return FinalAssembly{
		VideoKey:     outPath,
		VideoURL:     "file://" + filepath.ToSlash(outPath),
		DurationSec:  total,
		SceneOffsets: offsets,
	}, nil
}
