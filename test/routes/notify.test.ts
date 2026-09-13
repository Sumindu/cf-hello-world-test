import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSubscription } from "../../src/lib/db";
import webpush from "web-push";

describe("POST /admin/notify", () => {
  beforeEach(async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/notify-a",
      p256dh: "key-a",
      auth: "auth-a",
      group: "notify-group",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/notify-b",
      p256dh: "key-b",
      auth: "auth-b",
      group: "other-group",
    });
  });

  it("rejects requests without the admin secret", async () => {
    const response = await exports.default.fetch("https://example.com/admin/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "notify-group", title: "Hi", body: "Hello" }),
    });
    expect(response.status).toBe(401);
  });

  it("sends only to subscriptions in the requested group", async () => {
    const response = await exports.default.fetch("https://example.com/admin/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": env.ADMIN_NOTIFY_SECRET,
      },
      body: JSON.stringify({ group: "notify-group", title: "Hi", body: "Hello" }),
    });
    expect(response.status).toBe(200);
    const { sent, total } = await response.json<{ sent: number; total: number }>();
    expect(total).toBe(1);
    expect(sent).toBe(1);

    // Verify the correct endpoint was called
    const mocked = vi.mocked(webpush.sendNotification);
    expect(mocked).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/notify-a" }),
      expect.anything()
    );
    // Verify the other group's endpoint was NOT called
    expect(mocked).not.toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example.com/notify-b" }),
      expect.anything()
    );
  });

  it("rejects malformed JSON with valid admin secret", async () => {
    const response = await exports.default.fetch("https://example.com/admin/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": env.ADMIN_NOTIFY_SECRET,
      },
      body: "not valid json{",
    });
    expect(response.status).toBe(400);
  });
});
