export type AgentTier = "admin" | "mod" | "verified" | "public";

export type AgentReplyTarget =
  | {
      _type: "chat:Channel";
      adapterName: string;
      id: string;
      isDM: boolean;
      channelVisibility?: string;
    }
  | {
      _type: "chat:Thread";
      adapterName: string;
      id: string;
      channelId: string;
      isDM: boolean;
      channelVisibility?: string;
      currentMessage?: unknown;
    };

export type DiscordInvocationContext = {
  guildId?: string;
  channelId?: string;
  roleIds: string[];
  isDirectMessage?: boolean;
};
