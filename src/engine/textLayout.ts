/**
 * Text line-breaking — the one wrap algorithm, shared by the renderer (paintGlyphs) and build-time
 * layout (slide templates measuring how tall wrapped text will be). Pure given a `measure` callback,
 * so callers supply their own width source (the render ctx, or a measuring canvas).
 *
 * Greedy word-wrap: split on explicit "\n", then fill each line up to `maxWidth`, hard-breaking any
 * single word that is itself wider than `maxWidth`. Inter-word whitespace is collapsed to one space
 * (standard word-wrap), so leading/repeated spaces in a wrapped paragraph are not preserved.
 */
export function wrapText(str: string, maxWidth: number | undefined, measure: (s: string) => number): string[] {
  const paragraphs = str.split("\n");
  if (maxWidth === undefined || !(maxWidth > 0)) return paragraphs;
  const fits = (s: string): boolean => measure(s) <= maxWidth;
  const out: string[] = [];
  for (const para of paragraphs) {
    let line = "";
    for (const word of para.split(" ")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line !== "") out.push(line);
      if (fits(word)) {
        line = word;
        continue;
      }
      // A single word wider than maxWidth — hard-break it by character.
      let chunk = "";
      for (const ch of word) {
        if (chunk !== "" && !fits(chunk + ch)) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}
