import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

let client: S3Client | undefined;
const memoryStore = new Map<string, { data: string; contentType: string }>();

function getStorage() {
  if (!ENV.storageBucket) return null;
  client ??= new S3Client({
    region: ENV.storageRegion,
    ...(ENV.storageEndpoint ? { endpoint: ENV.storageEndpoint } : {}),
    forcePathStyle: ENV.storageForcePathStyle,
    ...(ENV.storageAccessKeyId && ENV.storageSecretAccessKey
      ? { credentials: { accessKeyId: ENV.storageAccessKeyId, secretAccessKey: ENV.storageSecretAccessKey } }
      : {}),
  });
  return { client, bucket: ENV.storageBucket };
}

function normalizeKey(value: string) {
  const key = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!key || key.split("/").some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid object key.");
  }
  return key;
}

export async function storagePut(
  relativeKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const normalizedKey = normalizeKey(relativeKey);
  const extension = normalizedKey.match(/\.[^./]+$/)?.[0] ?? "";
  const base = extension ? normalizedKey.slice(0, -extension.length) : normalizedKey;
  const key = `${base}_${randomUUID().replace(/-/g, "").slice(0, 12)}${extension}`;

  const storage = getStorage();
  if (!storage) {
    const base64 = typeof data === "string" ? Buffer.from(data).toString("base64") : Buffer.from(data).toString("base64");
    memoryStore.set(key, { data: base64, contentType });
    return { key, url: `data:${contentType};base64,${base64}` };
  }

  await storage.client.send(new PutObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));

  return { key, url: await storageGetSignedUrl(key) };
}

export async function storageGetSignedUrl(relativeKey: string) {
  const key = normalizeKey(relativeKey);
  const storage = getStorage();
  if (!storage) {
    const item = memoryStore.get(key);
    if (item) return `data:${item.contentType};base64,${item.data}`;
    return `#mock-storage-${key}`;
  }
  return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: 300 });
}
