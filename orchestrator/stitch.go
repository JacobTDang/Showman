package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// ObjectFetcher pulls stored object bytes (clips) out of the engine's object storage.
// HTTPEngineClient implements it via GET /objects/<key>.
type ObjectFetcher interface {
	FetchObject(ctx context.Context, key string) ([]byte, error)
}

// FFmpegStitcher concatenates the rendered scene clips into one MP4 using the ffmpeg
// concat demuxer. Video stream-copies (no re-encode — byte-deterministic, always
// available because the pipeline locks one canvas/encoder profile per job); audio is
// re-encoded through a loudness-normalization filter (Roadmap E6) so the final video's
// spoken volume is consistent regardless of how loud each scene's source TTS/tone
// happened to render — video determinism (what golden tests compare) is unaffected.
type FFmpegStitcher struct {
	// Fetcher pulls clip bytes from the engine.
	Fetcher ObjectFetcher
	// OutDir receives the final MP4 (one file per job). Created if absent.
	OutDir string
	// FFmpegPath overrides the ffmpeg binary (default "ffmpeg").
	FFmpegPath string
	// LoudnessTargetLUFS is the integrated-loudness target for the final mux's
	// loudnorm filter. Zero uses the default (-16 LUFS, the podcast/streaming norm
	// and this roadmap item's stated bar); set explicitly to override, or to a
	// sentinel your own code treats as "skip" if you need the old copy-only path.
	LoudnessTargetLUFS float64
}

// defaultLoudnessTargetLUFS is the EBU-ish streaming/podcast norm and Roadmap E6's
// acceptance bar ("mean -16±2 LUFS").
const defaultLoudnessTargetLUFS = -16.0

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
	var firstClipPath string
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
		clipPath := filepath.Join(work, name)
		if err := os.WriteFile(clipPath, data, 0o644); err != nil {
			return FinalAssembly{}, err
		}
		if len(listLines) == 0 {
			firstClipPath = clipPath
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
	target := f.LoudnessTargetLUFS
	if target == 0 {
		target = defaultLoudnessTargetLUFS
	}

	hasAudio := firstClipPath != "" && hasAudioStream(ctx, ffprobeBin(f.FFmpegPath), firstClipPath)

	// Roadmap E2: options.transition:"fade" takes a genuinely different mux path —
	// crossfading needs every clip decoded and re-encoded (xfade/acrossfade can't
	// run under stream copy), unlike the default cut's byte-deterministic concat.
	// This is a heavier, best-effort mux (its exact bytes depend on the installed
	// ffmpeg build's encoder, not just its inputs, so it's never render-cached).
	if s.Request.Options.Transition == "fade" {
		clipPaths := make([]string, len(s.Scenes))
		durations := make([]float64, len(s.Scenes))
		for i, sc := range s.Scenes {
			clipPaths[i] = filepath.Join(work, fmt.Sprintf("clip-%03d.mp4", sc.Index))
			durations[i] = sc.Render.DurationSec
		}
		return f.stitchWithFade(ctx, bin, target, work, outPath, clipPaths, durations, hasAudio)
	}

	var cmd *exec.Cmd
	if hasAudio {
		// Two-pass loudnorm: pass 1 measures the concatenated audio's actual
		// loudness (no output file — a null sink); pass 2 applies the filter with
		// those EXACT measured_* values and linear=true, which is what makes
		// loudnorm land close to the target instead of the single-pass mode's
		// rougher analysis-window estimate. Video stream-copies throughout
		// (deterministic, no re-encode) — only audio is re-encoded.
		measured, err := measureLoudness(ctx, bin, []string{"-f", "concat", "-safe", "0", "-i", listPath}, work, target)
		if err != nil {
			return FinalAssembly{}, fmt.Errorf("stitch: loudness measure: %w", err)
		}
		cmd = exec.CommandContext(ctx, bin,
			"-y", "-f", "concat", "-safe", "0", "-i", listPath,
			"-c:v", "copy",
			"-filter:a", measured.applyFilter(),
			"-c:a", "aac", "-b:a", "192k",
			"-movflags", "+faststart",
			outPath,
		)
	} else {
		// No audio stream to normalize (e.g. a silent/video-only render): fall back
		// to a plain stream-copy mux exactly as before E6.
		cmd = exec.CommandContext(ctx, bin,
			"-y", "-f", "concat", "-safe", "0", "-i", listPath,
			"-c", "copy", "-movflags", "+faststart",
			outPath,
		)
	}
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

// stitchWithFade crossfades every clip into the next (Roadmap E2): builds an xfade
// (video) + acrossfade (audio, when present) filter_complex chain into an
// intermediate file, then runs it through the same two-pass loudnorm treatment as
// the cut path so loudness stays consistent regardless of which transition a job
// picked. overlap is fixed at 0.5s per transition.
func (f *FFmpegStitcher) stitchWithFade(ctx context.Context, bin string, target float64, work, outPath string, clipPaths []string, durations []float64, hasAudio bool) (FinalAssembly, error) {
	const overlap = 0.5
	n := len(clipPaths)
	if n == 0 {
		return FinalAssembly{}, fmt.Errorf("stitch: no clips to fade between")
	}

	offsets := make([]float64, n)
	filterParts := make([]string, 0, 2*n)
	inputArgs := make([]string, 0, 2*n)
	for _, p := range clipPaths {
		inputArgs = append(inputArgs, "-i", p)
	}

	var total float64
	if n == 1 {
		// A single clip: nothing to crossfade — pass both streams through as-is.
		filterParts = append(filterParts, "[0:v]null[vout]")
		total = durations[0]
	} else {
		// merged tracks the running duration of the chain built SO FAR (each xfade
		// shortens the total by one overlap, since the two clips it joins share
		// `overlap` seconds instead of playing back to back).
		vPrev := "[0:v]"
		merged := durations[0]
		for i := 1; i < n; i++ {
			off := merged - overlap
			if off < 0 {
				off = 0
			}
			offsets[i] = off
			vOut := fmt.Sprintf("[v%d]", i)
			if i == n-1 {
				vOut = "[vout]"
			}
			filterParts = append(filterParts, fmt.Sprintf("%s[%d:v]xfade=transition=fade:duration=%g:offset=%g%s", vPrev, i, overlap, off, vOut))
			vPrev = vOut
			merged = off + durations[i] // == merged(prev) - overlap + durations[i]
		}
		total = merged

		if hasAudio {
			aPrev := "[0:a]"
			for i := 1; i < n; i++ {
				aOut := fmt.Sprintf("[a%d]", i)
				if i == n-1 {
					aOut = "[aout]"
				}
				filterParts = append(filterParts, fmt.Sprintf("%s[%d:a]acrossfade=d=%g%s", aPrev, i, overlap, aOut))
				aPrev = aOut
			}
		}
	}
	if hasAudio && n == 1 {
		filterParts = append(filterParts, "[0:a]anull[aout]")
	}

	filterComplex := strings.Join(filterParts, ";")
	intermediate := filepath.Join(work, "faded.mp4")
	args := append([]string{"-y"}, inputArgs...)
	args = append(args, "-filter_complex", filterComplex, "-map", "[vout]")
	if hasAudio {
		args = append(args, "-map", "[aout]", "-c:a", "aac", "-b:a", "192k")
	}
	args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", intermediate)

	cmd := exec.CommandContext(ctx, bin, args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return FinalAssembly{}, fmt.Errorf("stitch: ffmpeg fade: %w\n%s", err, truncate(string(out), 1200))
	}

	if !hasAudio {
		if err := os.Rename(intermediate, outPath); err != nil {
			return FinalAssembly{}, err
		}
		return FinalAssembly{VideoKey: outPath, VideoURL: "file://" + filepath.ToSlash(outPath), DurationSec: total, SceneOffsets: offsets}, nil
	}

	measured, err := measureLoudness(ctx, bin, []string{"-i", intermediate}, work, target)
	if err != nil {
		return FinalAssembly{}, fmt.Errorf("stitch: fade loudness measure: %w", err)
	}
	loudCmd := exec.CommandContext(ctx, bin,
		"-y", "-i", intermediate,
		"-c:v", "copy",
		"-filter:a", measured.applyFilter(),
		"-c:a", "aac", "-b:a", "192k",
		"-movflags", "+faststart",
		outPath,
	)
	if out, err := loudCmd.CombinedOutput(); err != nil {
		return FinalAssembly{}, fmt.Errorf("stitch: fade loudnorm: %w\n%s", err, truncate(string(out), 800))
	}

	return FinalAssembly{VideoKey: outPath, VideoURL: "file://" + filepath.ToSlash(outPath), DurationSec: total, SceneOffsets: offsets}, nil
}

// ffprobeBin derives the ffprobe path from an ffmpeg override (same directory, "ffmpeg"
// -> "ffprobe"), falling back to bare "ffprobe" on PATH — ffprobe ships alongside
// ffmpeg in every distro/package this project targets.
func ffprobeBin(ffmpegOverride string) string {
	if ffmpegOverride == "" {
		return "ffprobe"
	}
	dir := filepath.Dir(ffmpegOverride)
	if dir == "." {
		return "ffprobe"
	}
	name := "ffprobe"
	if strings.HasSuffix(strings.ToLower(filepath.Base(ffmpegOverride)), ".exe") {
		name += ".exe"
	}
	return filepath.Join(dir, name)
}

// hasAudioStream reports whether path has at least one audio stream. Used to decide
// whether the loudnorm pass is applicable at all (a silent/video-only clip has
// nothing to normalize) — false on any probe error, so a broken/missing ffprobe
// degrades to the plain-copy mux rather than failing the whole stitch.
func hasAudioStream(ctx context.Context, ffprobeBin, path string) bool {
	cmd := exec.CommandContext(ctx, ffprobeBin,
		"-v", "error", "-select_streams", "a",
		"-show_entries", "stream=codec_type",
		"-of", "csv=p=0",
		path,
	)
	out, err := cmd.Output()
	return err == nil && strings.TrimSpace(string(out)) != ""
}

// loudnormMeasurement is ffmpeg loudnorm's pass-1 JSON report: the concatenated
// audio's actual integrated loudness/true-peak/loudness-range/gating threshold, fed
// back into pass 2 (measured_* + linear=true) for an accurate second pass instead of
// the filter's own single-pass estimate.
type loudnormMeasurement struct {
	target       float64
	InputI       string `json:"input_i"`
	InputTP      string `json:"input_tp"`
	InputLRA     string `json:"input_lra"`
	InputThresh  string `json:"input_thresh"`
	TargetOffset string `json:"target_offset"`
}

func (m loudnormMeasurement) applyFilter() string {
	return fmt.Sprintf(
		"loudnorm=I=%g:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true",
		m.target, m.InputI, m.InputTP, m.InputLRA, m.InputThresh, m.TargetOffset,
	)
}

var loudnormJSONRe = regexp.MustCompile(`(?s)\{[^{}]*"input_i"[^{}]*\}`)

// measureLoudness runs ffmpeg's loudnorm filter in measurement mode (null output)
// over inputArgs (e.g. ["-f","concat","-safe","0","-i",listPath] for the cut path,
// or ["-i",path] for a single already-muxed file, as the fade path uses) and parses
// its JSON report.
func measureLoudness(ctx context.Context, bin string, inputArgs []string, dir string, target float64) (loudnormMeasurement, error) {
	args := append([]string{}, inputArgs...)
	args = append(args, "-af", fmt.Sprintf("loudnorm=I=%g:TP=-1.5:LRA=11:print_format=json", target), "-f", "null", "-")
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return loudnormMeasurement{}, fmt.Errorf("ffmpeg loudnorm measure: %w\n%s", err, truncate(string(out), 800))
	}
	raw := loudnormJSONRe.FindString(string(out))
	if raw == "" {
		return loudnormMeasurement{}, fmt.Errorf("no loudnorm measurement in ffmpeg output:\n%s", truncate(string(out), 800))
	}
	var m loudnormMeasurement
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return loudnormMeasurement{}, fmt.Errorf("parse loudnorm measurement: %w", err)
	}
	m.target = target
	return m, nil
}
