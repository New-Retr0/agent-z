import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordToolConfig } from "./config.js";
import {
  executeDiscordApiRead,
  executeDiscordMemberRoleUpdate,
} from "./capabilities.js";

const config: DiscordToolConfig = {
  token: "test-token",
  apiVersion: "10",
  baseUrl: "https://discord.com/api/v10",
  allowedGuildIds: new Set(["1488609972676984894"]),
  reactionVerifiedRoleId: "1496580080917414040",
  mcpAllowDeleteVerifiedRole: false,
  protectedOwnerUserId: "100000000000000000",
  userAgent: "Agent-Z-Test",
};

describe("Discord capability executors", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows broad GET reads while preserving query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeDiscordApiRead(
      config,
      {
        path: "/guilds/1488609972676984894/audit-logs",
        query: { limit: 25 },
      },
      { capabilityId: "discord_api_read", tier: "mod", invokerUserId: "user-1", expectedGuildId: "1488609972676984894" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/1488609972676984894/audit-logs?limit=25",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toContain('"ok": true');
  });

  it("verifies channel routes belong to the allowed invocation guild", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "1496580126601646150", guild_id: "999999999999999999" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeDiscordApiRead(
        config,
        { path: "/channels/1496580126601646150/messages", query: { limit: 10 } },
        { capabilityId: "discord_api_read", tier: "mod", expectedGuildId: "1488609972676984894" }
      )
    ).rejects.toThrow("does not match this invocation guild");
  });

  it("blocks protected-user role mutations", async () => {
    await expect(
      executeDiscordMemberRoleUpdate(
        config,
        {
          guildId: "1488609972676984894",
          userId: "100000000000000000",
          roleId: "1496580080917414041",
        },
        { capabilityId: "discord_assign_member_role", tier: "admin", expectedGuildId: "1488609972676984894" },
        "assign"
      )
    ).rejects.toThrow("Can't do that one.");
  });
});
