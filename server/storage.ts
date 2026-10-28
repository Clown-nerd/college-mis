import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Express } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "./_core/env";

let client: S3Client | undefined;
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), ".data", "storage");

export const ALLOWED_LMS_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "video/mp4",
  "audio/mpeg",
] as const;

export type AllowedLmsMimeType = (typeof ALLOWED_LMS_MIME_TYPES)[number];

export function validateSafeUpload(input: {
  name: string;
  mimeType: string;
  byteLength: number;
  maxBytes?: number;
  allowedMimeTypes?: readonly string[];
}): { safeName: string; mimeType: string } {
  const maxBytes = input.maxBytes ?? 10 * 1024 * 1024;
  if (input.byteLength <= 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (input.byteLength > maxBytes) {
    throw new Error(`Uploaded file exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
  const allowed = input.allowedMimeTypes ?? ALLOWED_LMS_MIME_TYPES;
  if (!allowed.includes(input.mimeType)) {
    throw new Error(`Unsupported file type: ${input.mimeType}.`);
  }
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "file");
  if (!safeName) {
    throw new Error("Invalid file name.");
  }
  return { safeName, mimeType: input.mimeType };
}

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

function getSigningSecret() {
  return ENV.cookieSecret || "college-mis-local-storage-signing-secret";
}

function signLocalStorageKey(key: string, expiresAtUnix: number): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${key}:${expiresAtUnix}`)
    .digest("hex");
}

function verifyLocalStorageSignature(key: string, expiresAtUnix: number, signature: string): boolean {
  if (!Number.isFinite(expiresAtUnix) || Date.now() > expiresAtUnix * 1000) {
    return false;
  }
  const expected = signLocalStorageKey(key, expiresAtUnix);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
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
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  const storage = getStorage();
  if (!storage) {
    const filePath = path.resolve(LOCAL_STORAGE_ROOT, key);
    if (!filePath.startsWith(LOCAL_STORAGE_ROOT)) {
      throw new Error("Invalid storage path.");
    }
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    await fs.promises.writeFile(
      `${filePath}.meta.json`,
      JSON.stringify({ contentType, sizeBytes: buffer.byteLength, createdAt: new Date().toISOString() }),
      "utf-8",
    );
    return { key, url: await storageGetSignedUrl(key) };
  }

  await storage.client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return { key, url: await storageGetSignedUrl(key) };
}

export async function storageGetSignedUrl(relativeKey: string, expiresInSeconds = 900) {
  const key = normalizeKey(relativeKey);
  const storage = getStorage();
  if (!storage) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const sig = signLocalStorageKey(key, expires);
    return `/api/storage/files?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
  }
  return getSignedUrl(
    storage.client,
    new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export function registerStorageRoutes(app: Express) {
  app.get("/api/storage/files", async (req, res) => {
    try {
      const rawKey = typeof req.query.key === "string" ? req.query.key : "";
      const expires = Number(req.query.expires);
      const sig = typeof req.query.sig === "string" ? req.query.sig : "";
      const key = normalizeKey(rawKey);
      if (!verifyLocalStorageSignature(key, expires, sig)) {
        res.status(403).json({ error: "Signed file URL is invalid or expired." });
        return;
      }
      const filePath = path.resolve(LOCAL_STORAGE_ROOT, key);
      if (!filePath.startsWith(LOCAL_STORAGE_ROOT) || !fs.existsSync(filePath)) {
        res.status(404).json({ error: "Stored file was not found." });
        return;
      }
      let contentType = "application/octet-stream";
      const metaPath = `${filePath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, "utf-8")) as { contentType?: string };
        if (meta.contentType) contentType = meta.contentType;
      }
      const fileName = path.basename(filePath);
      const inlinePreviewable = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "video/mp4", "audio/mpeg"].includes(contentType);
      res.setHeader("Content-Type", contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader(
        "Content-Disposition",
        `${inlinePreviewable ? "inline" : "attachment"}; filename="${fileName.replace(/"/g, "")}"`,
      );
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.status(400).json({ error: "Unable to serve requested file." });
    }
  });
}
