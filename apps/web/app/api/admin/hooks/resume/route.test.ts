import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdmin: vi.fn(),
  resumeHook: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  assertAdmin: mocks.assertAdmin,
}));

vi.mock("workflow/api", () => ({
  resumeHook: mocks.resumeHook,
}));

import { POST } from "./route";

describe("admin hooks resume route", () => {
  beforeEach(() => {
    mocks.assertAdmin.mockResolvedValue(null);
    mocks.resumeHook.mockResolvedValue({ runId: "workflow-run" });
  });

  it("returns the admin denial response when unauthorized", async () => {
    mocks.assertAdmin.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(new Request("https://agent.test/api/admin/hooks/resume", { method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
    expect(mocks.resumeHook).not.toHaveBeenCalled();
  });

  it("requires a hook token", async () => {
    const response = await POST(
      new Request("https://agent.test/api/admin/hooks/resume", {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "token required" });
    expect(response.status).toBe(400);
  });

  it("resumes hooks with an explicit approval boolean", async () => {
    const response = await POST(
      new Request("https://agent.test/api/admin/hooks/resume", {
        method: "POST",
        body: JSON.stringify({ token: "hook-token", approved: true }),
      })
    );

    expect(mocks.resumeHook).toHaveBeenCalledWith("hook-token", { approved: true });
    await expect(response.json()).resolves.toEqual({ runId: "workflow-run" });
  });

  it("returns structured errors when Workflow resume fails", async () => {
    mocks.resumeHook.mockRejectedValue(new Error("hook not found"));

    const response = await POST(
      new Request("https://agent.test/api/admin/hooks/resume", {
        method: "POST",
        body: JSON.stringify({ token: "missing-hook" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not resume workflow hook" });
  });
});

