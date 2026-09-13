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

  it("includes uploaded images in the gallery", async () => {
    const uploadBody = new FormData();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      ),
      (c) => c.charCodeAt(0)
    );
    uploadBody.append("image", new File([bytes], "pixel.png", { type: "image/png" }));
    const uploadResponse = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body: uploadBody,
    });
    const { url } = await uploadResponse.json<{ url: string }>();

    const homeResponse = await exports.default.fetch("https://example.com/");
    const homeBody = await homeResponse.text();
    expect(homeBody).toContain(`src="${url}"`);
  });
});
