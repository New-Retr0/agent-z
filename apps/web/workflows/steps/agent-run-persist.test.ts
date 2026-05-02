import { describe, expect, it } from "vitest";
import { formatDiscordChunks } from "./agent-run-persist";

describe("formatDiscordChunks", () => {
  it("includes a run header and fallback text for empty output", () => {
    const chunks = formatDiscordChunks("12345678-1234-1234-1234-123456789012", "   ");

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("**Agent Z result**");
    expect(chunks[0]).toContain("12345678");
    expect(chunks[0]).toContain("no final text was returned");
  });

  it("keeps Discord messages under the target chunk size", () => {
    const chunks = formatDiscordChunks("12345678-1234-1234-1234-123456789012", "x".repeat(4_500));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1_900)).toBe(true);
    expect(chunks.join("")).toContain("x".repeat(1_900));
  });
});

