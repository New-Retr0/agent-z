const MAX = 2000;

export function chunkDiscordMessage(s: string): string[] {
  if (s.length <= MAX) {
    return [s];
  }
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + MAX, s.length);
    if (end < s.length) {
      const slice = s.slice(i, end);
      const br = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(" "));
      if (br > MAX * 0.6) {
        end = i + br + 1;
      }
    }
    parts.push(s.slice(i, end));
    i = end;
  }
  return parts;
}
