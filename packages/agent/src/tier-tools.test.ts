import { describe, expect, it } from "vitest";
import { getToolsForTier } from "./tier-tools";

describe("getToolsForTier", () => {
  it("exposes safe knowledge search to every tier", async () => {
    const tools = getToolsForTier("verified");

    expect(Object.keys(tools)).toEqual(["ping", "summarize_intent", "search_knowledge"]);
    const result = await tools.search_knowledge.execute({ query: "knowledge bundle" });
    expect(result.matches[0]).toMatchObject({
      file: "stub-welcome.md",
      title: "Knowledge bundle",
    });
  });

  it("keeps higher-risk helpers scoped to elevated tiers", () => {
    expect(Object.keys(getToolsForTier("public"))).not.toContain("mod_note");
    expect(Object.keys(getToolsForTier("public"))).not.toContain("discord_api_request");
    expect(Object.keys(getToolsForTier("mod"))).toContain("mod_note");
    expect(Object.keys(getToolsForTier("mod"))).toContain("discord_api_request");
    expect(Object.keys(getToolsForTier("admin"))).toContain("admin_config_hint");
    expect(Object.keys(getToolsForTier("admin"))).toContain("discord_api_request");
  });
});

