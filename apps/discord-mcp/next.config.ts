import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Discord MCP server is a thin Node app that calls Prisma + Discord REST.
  // Keep the worker out of the build trace so we don't ship the entire monorepo.
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
