import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntimeConfig: vi.fn(),
  roleMappingFindMany: vi.fn(),
  channelMappingFindMany: vi.fn(),
}));

vi.mock("@repo/config/runtime-config", () => ({
  getRuntimeConfig: mocks.getRuntimeConfig,
}));

vi.mock("@repo/db", () => ({
  prisma: {
    roleMapping: { findMany: mocks.roleMappingFindMany },
    channelMapping: { findMany: mocks.channelMappingFindMany },
  },
}));

import { resolveDiscordAccess } from "./discord-access";

describe("resolveDiscordAccess", () => {
  beforeEach(() => {
    mocks.getRuntimeConfig.mockResolvedValue({ publicTierEnabled: false });
    mocks.roleMappingFindMany.mockResolvedValue([]);
    mocks.channelMappingFindMany.mockResolvedValue([]);
  });

  it("requires Discord context and denies DMs", async () => {
    await expect(resolveDiscordAccess(undefined)).resolves.toEqual({
      allowed: false,
      reason: "Discord invocation context is required.",
    });

    await expect(resolveDiscordAccess({ roleIds: [], isDirectMessage: true })).resolves.toEqual({
      allowed: false,
      reason: "Agent Z runs in server channels, not DMs.",
    });
  });

  it("enforces allowed channels only when channel mappings exist", async () => {
    mocks.channelMappingFindMany.mockResolvedValue([{ kind: "agent", discordChannelId: "123456789012345678" }]);

    await expect(
      resolveDiscordAccess({
        channelId: "999999999999999999",
        roleIds: ["111111111111111111"],
        isDirectMessage: false,
      })
    ).resolves.toEqual({
      allowed: false,
      reason: "Agent Z is not enabled in this channel.",
    });
  });

  it("chooses the highest mapped tier for the user's roles", async () => {
    mocks.roleMappingFindMany.mockResolvedValue([
      { kind: "verified", discordRoleId: "111111111111111111" },
      { kind: "admin", discordRoleId: "222222222222222222" },
      { kind: "mod", discordRoleId: "333333333333333333" },
    ]);

    await expect(
      resolveDiscordAccess({
        channelId: "123456789012345678",
        roleIds: ["111111111111111111", "222222222222222222"],
        isDirectMessage: false,
      })
    ).resolves.toEqual({ allowed: true, tier: "admin" });
  });

  it("falls back to public only when enabled", async () => {
    await expect(
      resolveDiscordAccess({
        channelId: "123456789012345678",
        roleIds: [],
        isDirectMessage: false,
      })
    ).resolves.toEqual({
      allowed: false,
      reason: "You need a mapped Discord role to run Agent Z.",
    });

    mocks.getRuntimeConfig.mockResolvedValue({ publicTierEnabled: true });

    await expect(
      resolveDiscordAccess({
        channelId: "123456789012345678",
        roleIds: [],
        isDirectMessage: false,
      })
    ).resolves.toEqual({ allowed: true, tier: "public" });
  });

  it("fails closed when the access policy cannot be read", async () => {
    mocks.roleMappingFindMany.mockRejectedValue(new Error("db down"));

    await expect(
      resolveDiscordAccess({
        channelId: "123456789012345678",
        roleIds: ["111111111111111111"],
        isDirectMessage: false,
      })
    ).resolves.toEqual({
      allowed: false,
      reason: "Discord access policy is unavailable.",
    });
  });
});

