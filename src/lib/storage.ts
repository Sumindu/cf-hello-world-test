export async function putImage(
  kv: KVNamespace,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<void> {
  await kv.put(key, data, {
    metadata: { contentType },
  });
}

export type StoredImage = { body: ArrayBuffer; contentType: string } | null;

export async function getImage(kv: KVNamespace, key: string): Promise<StoredImage> {
  const result = await kv.getWithMetadata<{ contentType: string }>(key, "arrayBuffer");
  if (result.value === null) return null;
  return { body: result.value, contentType: result.metadata?.contentType ?? "application/octet-stream" };
}

export async function listImageKeys(kv: KVNamespace, limit = 12): Promise<string[]> {
  const listed = await kv.list({ prefix: "img/", limit });
  return listed.keys.map((k) => k.name).sort().reverse();
}
