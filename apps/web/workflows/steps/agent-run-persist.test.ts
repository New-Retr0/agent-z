import { describe, expect, it } from "vitest";
import { formatDiscordChunks } from "./agent-run-persist";

describe("formatDiscordChunks", () => {
  it("omits the run header by default for normal channel replies", () => {
    const chunks = formatDiscordChunks("12345678-1234-1234-1234-123456789012", "   ");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain("**Agent Z result**");
    expect(chunks[0]).not.toContain("12345678");
    expect(chunks[0]).toContain("no final text was returned");
  });

  it("can include a staff header for private interaction replies without run ids", () => {
    const chunks = formatDiscordChunks("12345678-1234-1234-1234-123456789012", "Done.", { includeHeader: true });

    expect(chunks[0]).toContain("**Agent Z staff result**");
    expect(chunks[0]).not.toContain("12345678");
  });

  it("keeps Discord messages under the target chunk size", () => {
    const chunks = formatDiscordChunks("12345678-1234-1234-1234-123456789012", "x".repeat(4_500));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1_900)).toBe(true);
    expect(chunks.join("")).toContain("x".repeat(1_900));
  });
});

