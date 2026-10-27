import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

let client: S3Client | undefined;

function getStorage() {
  if (!ENV.storageBucket) throw new Error("STORAGE_BUCKET is not configured.");
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
  const { client, bucket } = getStorage();
  const normalizedKey = normalizeKey(relativeKey);
  const extension = normalizedKey.match(/\.[^./]+$/)?.[0] ?? "";
  const base = extension ? normalizedKey.slice(0, -extension.length) : normalizedKey;
  const key = `${base}_${randomUUID().replace(/-/g, "").slice(0, 12)}${extension}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: typeof data === "string" ? Buffer.from(data) : data,
    ContentType: contentType,
  }));

  return { key, url: await storageGetSignedUrl(key) };
}

export async function storageGetSignedUrl(relativeKey: string) {
  const { client, bucket } = getStorage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: normalizeKey(relativeKey) }), { expiresIn: 300 });
}
