/**
 * Caption readability helpers — pure (IO-free) utilities for presenting subtitle
 * cues nicely: greedy line-wrapping to a max width/line count, and a minimum
 * on-screen duration so a cue stays up long enough to actually be read. Kept
 * separate from the cue-timing/render code so they share one tested base.
 */

/**
 * Greedily word-wrap `text` into lines no longer than `maxLineLen`, joined by "\n",
 * capped at `maxLines` lines. Internal whitespace is collapsed first. A single short
 * line is returned unchanged (no newline). An over-long word is never split — it sits
 * on its own line and may exceed `maxLineLen`. If the text needs more than `maxLines`
 * lines, the leftover words are packed onto the last line (which may then exceed the width).
 */
export function wrapCaption(text: string, maxLineLen = 42, maxLines = 2): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  const words = collapsed.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0)
      cur = w; // first word always starts the line (even if over-long)
    else if (cur.length + 1 + w.length <= maxLineLen) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur.length > 0) lines.push(cur);
  if (lines.length <= maxLines) return lines.join("\n");
  // Overflow: keep the first maxLines-1 lines, pack everything left onto the last line.
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1).join(" ");
  return [...head, tail].join("\n");
}

/**
 * Minimum seconds a cue should stay up to be readable: `max(floorSec, visibleChars / charsPerSec)`,
 * where `visibleChars` counts the trimmed text's non-whitespace characters plus spaces (line breaks
 * and other whitespace don't count). 17 chars/sec is a common subtitle reading-speed standard.
 */
export function minReadableDuration(text: string, charsPerSec = 17, floorSec = 0.7): number {
  const visibleChars = text.trim().replace(/[^\S ]/g, "").length; // drop whitespace except spaces
  return Math.max(floorSec, visibleChars / charsPerSec);
}
