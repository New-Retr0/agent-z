/**
 * Human-friendly timestamps for admin tables (server-rendered "time ago").
 */
export function formatRelativeAgo(date: Date, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}
