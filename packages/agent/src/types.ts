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
    }
  | {
      _type: "discord:Interaction";
      applicationId: string;
      interactionToken: string;
    }
  | {
      _type: "discord:Channel";
      channelId: string;
      messageId?: string;
    };

export type DiscordInvocationContext = {
  guildId?: string;
  channelId?: string;
  roleIds: string[];
  isDirectMessage?: boolean;
};
