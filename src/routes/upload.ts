import type { Context } from "hono";
import type { Env } from "../index";
import { getImage, putImage } from "../lib/storage";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export async function uploadRoute(c: Context<{ Bindings: Env }>) {
  const body = await c.req.parseBody();
  const file = body["image"];

  if (!(file instanceof File)) {
    return c.json({ error: "image field required" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "must be an image" }, 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "file too large (max 2MB)" }, 413);
  }

  const ext = file.type.split("/")[1] || "bin";
  const key = `img/${crypto.randomUUID()}.${ext}`;
  await putImage(c.env.IMAGES_KV, key, await file.arrayBuffer(), file.type);

  return c.json({ key, url: `/image/${key}` });
}

export async function imageRoute(c: Context<{ Bindings: Env }>) {
  const key = c.req.path.replace(/^\/image\//, "");
  const image = await getImage(c.env.IMAGES_KV, key);
  if (!image) {
    return c.notFound();
  }
  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
