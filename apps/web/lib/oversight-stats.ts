import { prisma, getEmbedQueueDepth } from "@repo/db";

export interface OversightStats {
  total: number;
  embedded: number;
  pendingEmbed: number;
  queueDepth: number;
  last24h: number;
  recent: Array<{
    id: string;
    channelId: string;
    authorName: string | null;
    authorIsBot: boolean;
    content: string;
    sentAt: Date;
    embeddedAt: Date | null;
  }>;
}

/**
 * Pulls a single page of stats for the /admin/oversight dashboard. All
 * queries are read-only and tolerant: any failure surfaces as zeros + an
 * empty list so the page still renders.
 */
export async function loadOversightStats(): Promise<OversightStats> {
  try {
    const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, embedded, last24h, recent, queueDepth] = await Promise.all([
      prisma.message.count(),
      prisma.message.count({ where: { embeddedAt: { not: null } } }),
      prisma.message.count({ where: { sentAt: { gte: day } } }),
      prisma.message.findMany({
        orderBy: { sentAt: "desc" },
        take: 20,
        select: {
          id: true,
          channelId: true,
          authorName: true,
          authorIsBot: true,
          content: true,
          sentAt: true,
          embeddedAt: true,
        },
      }),
      getEmbedQueueDepth().catch(() => 0),
    ]);
    return {
      total,
      embedded,
      pendingEmbed: Math.max(0, total - embedded),
      queueDepth,
      last24h,
      recent,
    };
  } catch {
    return {
      total: 0,
      embedded: 0,
      pendingEmbed: 0,
      queueDepth: 0,
      last24h: 0,
      recent: [],
    };
  }
}
