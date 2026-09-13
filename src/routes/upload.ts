import type { Context } from "hono";
import type { Env } from "../index";
import { getImage, putImage } from "../lib/storage";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Allowlist: the raw multipart Content-Type is attacker-controlled, so it must
// never reach the stored key or the stored metadata. Only these exact types are
// accepted, and only the canonical extension/MIME below is ever persisted.
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Reverse lookup so the Content-Type we persist comes out of the table above
// rather than being the raw header string echoed back.
const CANONICAL_TYPE_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_IMAGE_TYPES).map(([type, ext]) => [ext, type])
);

export async function uploadRoute(c: Context<{ Bindings: Env }>) {
  const body = await c.req.parseBody();
  const file = body["image"];

  if (!(file instanceof File)) {
    return c.json({ error: "image field required" }, 400);
  }
  if (!Object.hasOwn(ALLOWED_IMAGE_TYPES, file.type)) {
    return c.json({ error: "unsupported image type" }, 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "file too large (max 2MB)" }, 413);
  }

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  const contentType = CANONICAL_TYPE_BY_EXT[ext];
  // Descending ("inverted") millisecond timestamp first, so that ascending
  // lexicographic order over these keys is newest-first. KV's list() with a
  // limit returns the first N keys in ascending lexicographic order, so this
  // lets the gallery page the newest images directly without listing the
  // whole namespace. 9999999999999 is safely past any realistic Date.now()
  // for centuries, keeping the subtraction a positive 13-digit number; the
  // UUID keeps keys unique within the same millisecond.
  const timestampOrdinal = (9999999999999 - Date.now()).toString().padStart(13, "0");
  const key = `img/${timestampOrdinal}-${crypto.randomUUID()}.${ext}`;
  await putImage(c.env.IMAGES_KV, key, await file.arrayBuffer(), contentType);

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
