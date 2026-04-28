import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildTextBasedChannel,
  type User,
} from "discord.js";

const TIMEOUT_MS = 5 * 60 * 1000;

type Entry = {
  invokerId: string;
  resolve: (v: boolean) => void;
  t: ReturnType<typeof setTimeout>;
};

const store = new Map<string, Entry>();

function approvalPrefix(): string {
  return "azc:";
}

export function parseConfirmId(customId: string): { kind: "yes" | "no"; id: string } | null {
  if (!customId.startsWith(approvalPrefix())) return null;
  const rest = customId.slice(approvalPrefix().length);
  const m = /^(y|n):(.+)$/.exec(rest);
  if (!m) return null;
  return { kind: m[1] === "y" ? "yes" : "no", id: m[2]! };
}

/**
 * Post a public confirmation message; resolves when the invoker clicks Yes/No or when timed out.
 */
export async function waitForDestructiveConfirm(opts: {
  channel: GuildTextBasedChannel;
  invoker: User;
  summary: string;
}): Promise<boolean> {
  const id = randomBytes(12).toString("hex");
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      const e = store.get(id);
      if (e) {
        store.delete(id);
        resolve(false);
      }
    }, TIMEOUT_MS);

    store.set(id, { invokerId: opts.invoker.id, resolve, t });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${approvalPrefix()}y:${id}`)
        .setLabel("Yes")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${approvalPrefix()}n:${id}`)
        .setLabel("No")
        .setStyle(ButtonStyle.Danger)
    );

    const content = `**${opts.invoker}, confirm this action?**\n${opts.summary}\n-# \`agent-z\` — expires in 5 minutes`;

    void opts.channel
      .send({ content: content.slice(0, 2000), components: [row] })
      .catch(() => {
        store.delete(id);
        clearTimeout(t);
        resolve(false);
      });
  });
}

export function resolveConfirmByButton(
  id: string,
  userId: string,
  kind: "yes" | "no"
): { ok: boolean; notForYou?: boolean } {
  const e = store.get(id);
  if (!e) return { ok: false };
  if (e.invokerId !== userId) {
    return { ok: false, notForYou: true };
  }
  clearTimeout(e.t);
  store.delete(id);
  e.resolve(kind === "yes");
  return { ok: true };
}

export function isPendingConfirmId(id: string): boolean {
  return store.has(id);
}
