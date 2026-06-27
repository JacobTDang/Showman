/**
 * Mux an audio track into a video (M5.4). FFmpeg copies the video stream and
 * encodes the narration to AAC, capping at the shorter stream so A/V stay aligned.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface MuxOptions {
  ffmpegPath?: string;
  audioBitrate?: string;
}

/** Combine `videoPath` + `audioWav` (WAV bytes) into `outPath` (mp4, AAC audio). */
export async function muxAudioVideo(videoPath: string, audioWav: Buffer, outPath: string, options: MuxOptions = {}): Promise<void> {
  const { ffmpegPath = "ffmpeg", audioBitrate = "128k" } = options;
  const scratch = mkdtempSync(join(tmpdir(), "showman-mux-"));
  const audioPath = join(scratch, "narration.wav");
  writeFileSync(audioPath, audioWav);

  const args = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", audioBitrate,
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ];

  const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString();
    if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg ("${ffmpegPath}"): ${err.message}`)));
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg mux exited with code ${code}.\n${stderr.slice(-2000)}`))));
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
