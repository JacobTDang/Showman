/**
 * M5.5 — Captions / subtitles.
 *
 * We own the narration timeline, so captions are generated directly from it (no
 * speech recognition needed). Accessibility + early-literacy support: a child sees
 * the words as they're spoken. Emits WebVTT and SRT.
 */

import type { NarrationTrack } from "../spec/types.js";

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/**
 * Build caption cues from a narration track, clamped to the scene duration.
 * Cues never overlap (each is bounded by the next segment's start) and degenerate
 * cues (starting at/after the scene end) are dropped. If `segmentDurations` is
 * provided (the actual synthesized speech lengths, sorted by start time), cue ends
 * track the spoken audio instead of guessing.
 */
export function captionsFromNarration(narration: NarrationTrack, sceneDuration: number, segmentDurations?: number[]): Cue[] {
  const segments = [...(narration.segments ?? [])].sort((a, b) => a.t - b.t);
  const cues: Cue[] = [];
  segments.forEach((seg, i) => {
    if (seg.t >= sceneDuration) return; // a cue that starts after the video ended is meaningless
    const next = segments[i + 1];
    const hardEnd = next ? next.t : sceneDuration; // no overlap with the following cue
    const dur = segmentDurations?.[i] ?? seg.duration;
    const naturalEnd = dur !== undefined ? seg.t + dur : hardEnd;
    const end = Math.min(Math.max(seg.t + 0.3, naturalEnd), hardEnd, sceneDuration);
    if (end > seg.t) cues.push({ start: seg.t, end, text: seg.text });
  });
  return cues;
}

function fmtTimestamp(sec: number, comma: boolean): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const sep = comma ? "," : ".";
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(millis, 3)}`;
}

/** WebVTT document. */
export function toVTT(cues: Cue[]): string {
  const blocks = cues.map((c) => `${fmtTimestamp(c.start, false)} --> ${fmtTimestamp(c.end, false)}\n${c.text}`);
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/** SubRip (SRT) document. */
export function toSRT(cues: Cue[]): string {
  const blocks = cues.map((c, i) => `${i + 1}\n${fmtTimestamp(c.start, true)} --> ${fmtTimestamp(c.end, true)}\n${c.text}`);
  return `${blocks.join("\n\n")}\n`;
}
