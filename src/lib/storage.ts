export async function putImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
}

export async function getImage(bucket: R2Bucket, key: string) {
  return bucket.get(key);
}

export async function listImageKeys(bucket: R2Bucket, limit = 12): Promise<string[]> {
  const listed = await bucket.list({ prefix: "img/", limit });
  return listed.objects.map((o) => o.key).sort().reverse();
}
