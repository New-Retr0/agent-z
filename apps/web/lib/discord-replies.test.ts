import { describe, expect, it } from "vitest";
import { DISCORD_PUBLIC_REPLY_MAX_CHARS, formatDiscordChunks, truncateDiscordReply } from "./discord-replies";

describe("formatDiscordChunks", () => {
  it("uses default empty placeholder without an extra header", () => {
    const chunks = formatDiscordChunks("   ");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain("**Agent Z staff result**");
    expect(chunks[0]).toContain("(no output)");
  });

  it("can prepend a staff header for interaction-style replies", () => {
    const chunks = formatDiscordChunks("Done.", { header: "**Agent Z staff result**\n\n" });
    expect(chunks[0]).toContain("**Agent Z staff result**");
    expect(chunks[0]).toContain("Done.");
  });

  it("keeps Discord messages under the target chunk size", () => {
    const chunks = formatDiscordChunks("x".repeat(4_500));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1_900)).toBe(true);
    expect(chunks.join("")).toContain("x".repeat(1_900));
  });

  it("caps total length before chunking", () => {
    const long = "y".repeat(DISCORD_PUBLIC_REPLY_MAX_CHARS + 500);
    const chunks = formatDiscordChunks(long, { maxTotalChars: DISCORD_PUBLIC_REPLY_MAX_CHARS, maxChunks: 3 });
    const joined = chunks.join("");
    expect(joined.length).toBeLessThanOrEqual(DISCORD_PUBLIC_REPLY_MAX_CHARS + 120);
    expect(joined).toContain("Truncated");
  });

  it("respects max chunk count", () => {
    const chunks = formatDiscordChunks(`${"a\n".repeat(300)}end`, { maxTotalChars: 100_000, maxChunks: 2, chunkLimit: 100 });
    expect(chunks.length).toBeLessThanOrEqual(2);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });

  it("truncateDiscordReply adds footer when over limit", () => {
    const t = truncateDiscordReply("z".repeat(5000), 100);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(t).toContain("Truncated");
  });
});