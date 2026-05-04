import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToolsForTier } from "./tier-tools";

describe("getToolsForTier", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.DISCORD_BOT_TOKEN = "test-token";
    delete process.env.DISCORD_ALLOWED_GUILD_IDS;
  });

  it("exposes no model tools for lower tiers without Discord HTTP access", () => {
    expect(Object.keys(getToolsForTier("public"))).toEqual([]);
    expect(Object.keys(getToolsForTier("verified"))).toEqual([]);
  });

  it("keeps higher-risk helpers scoped to elevated tiers", () => {
    expect(Object.keys(getToolsForTier("public"))).not.toContain("mod_note");
    expect(Object.keys(getToolsForTier("verified"))).not.toContain("mod_note");
    expect(Object.keys(getToolsForTier("verified"))).not.toContain("discord_api_read");
    expect(Object.keys(getToolsForTier("mod"))).toContain("mod_note");
    expect(Object.keys(getToolsForTier("mod"))).toContain("discord_api_read");
    expect(Object.keys(getToolsForTier("admin"))).toContain("admin_config_hint");
    expect(Object.keys(getToolsForTier("admin"))).toEqual([
      "mod_note",
      "admin_config_hint",
      "discord_api_read",
      "discord_send_message",
      "discord_timeout_member",
      "discord_assign_member_role",
      "discord_remove_member_role",
    ]);
  });

  it("keeps broad Discord API reads but fixes the method to GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ id: "1488609972676984894", name: "Guild" }, {
        headers: { "x-ratelimit-remaining": "1" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const tools = getToolsForTier("mod");
    const readTool = "discord_api_read" in tools ? tools.discord_api_read : undefined;
    if (!readTool) {
      throw new Error("mod tier should expose discord_api_read");
    }
    const result = await readTool.execute(
      { path: "/guilds/1488609972676984894", query: { with_counts: true } },
      {
        experimental_context: {
          tier: "mod",
          invokerUserId: "100000000000000000",
          discordContext: {
            guildId: "1488609972676984894",
            channelId: "1496580126601646150",
            roleIds: [],
            isDirectMessage: false,
          },
        },
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/1488609972676984894?with_counts=true",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain('"name": "Guild"');
  });

  it("does not expose internal maintenance helpers as model-callable tools", () => {
    for (const tier of ["public", "verified", "mod", "admin"] as const) {
      expect(Object.keys(getToolsForTier(tier))).not.toContain("ping");
      expect(Object.keys(getToolsForTier(tier))).not.toContain("summarize_intent");
    }
  });
});
