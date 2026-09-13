import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns OK", async () => {
    const response = await exports.default.fetch("https://example.com/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});
