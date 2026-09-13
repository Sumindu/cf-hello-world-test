import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /", () => {
  it("renders HTML containing the visit count", async () => {
    const first = await exports.default.fetch("https://example.com/");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/html");
    const firstBody = await first.text();
    expect(firstBody).toMatch(/viewed <span class="count">1<\/span> times/);

    const second = await exports.default.fetch("https://example.com/");
    const secondBody = await second.text();
    expect(secondBody).toMatch(/viewed <span class="count">2<\/span> times/);
  });
});
