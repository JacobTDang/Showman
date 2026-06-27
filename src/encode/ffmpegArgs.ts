/**
 * FFmpeg argument builder for rawvideo(RGBA) -> mp4. Shared by the monolithic
 * encoder (encodeVideo) and the distributed assembler (M3), so a sharded render
 * and a single-process render with the same options produce byte-identical mp4s.
 */

export interface EncodeArgsOptions {
  width: number;
  height: number;
  fps: number;
  crf?: number;
  preset?: string;
  pixelFormat?: string;
  deterministic?: boolean;
  outPath: string;
}

/** Build the full FFmpeg argv (rawvideo on pipe:0 -> mp4 at outPath). */
export function buildEncodeArgs(opts: EncodeArgsOptions): string[] {
  const { width, height, fps, crf = 18, preset = "medium", pixelFormat = "yuv420p", deterministic = false, outPath } = opts;
  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-pix_fmt",
    pixelFormat,
    "-movflags",
    "+faststart",
  ];
  if (deterministic) {
    args.push(
      "-threads",
      "1",
      "-x264-params",
      "threads=1:sliced-threads=0",
      "-bitexact",
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      "-map_metadata",
      "-1",
    );
  }
  args.push(outPath);
  return args;
}
