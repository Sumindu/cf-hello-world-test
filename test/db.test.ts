import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addSubscription, getSubscriptionsByGroup, recordVisit } from "../src/lib/db";

describe("recordVisit", () => {
  it("increments and returns the running count", async () => {
    const first = await recordVisit(env.DB);
    const second = await recordVisit(env.DB);
    expect(second).toBe(first + 1);
  });
});

describe("push subscriptions", () => {
  it("stores and retrieves subscriptions by group", async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/a",
      p256dh: "key-a",
      auth: "auth-a",
      group: "testers",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/b",
      p256dh: "key-b",
      auth: "auth-b",
      group: "all",
    });

    const testers = await getSubscriptionsByGroup(env.DB, "testers");
    expect(testers).toHaveLength(1);
    expect(testers[0].endpoint).toBe("https://push.example.com/a");
  });

  it("upserts on repeated subscribe with the same endpoint", async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/c",
      p256dh: "old-key",
      auth: "old-auth",
      group: "all",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/c",
      p256dh: "new-key",
      auth: "new-auth",
      group: "vip",
    });

    const vip = await getSubscriptionsByGroup(env.DB, "vip");
    expect(vip).toHaveLength(1);
    expect(vip[0].p256dh).toBe("new-key");
  });
});
