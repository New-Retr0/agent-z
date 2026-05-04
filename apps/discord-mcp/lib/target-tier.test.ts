import { describe, expect, it } from "vitest";
import { tierBlocksAgentModeration } from "./target-tier";

describe("tierBlocksAgentModeration", () => {
  it("protects admin-tier members from agent moderation", () => {
    expect(tierBlocksAgentModeration("admin")).toBe(true);
    expect(tierBlocksAgentModeration("mod")).toBe(false);
    expect(tierBlocksAgentModeration("verified")).toBe(false);
    expect(tierBlocksAgentModeration("public")).toBe(false);
  });
});
