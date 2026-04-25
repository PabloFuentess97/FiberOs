import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY no configurados");
  }
  _client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // MinIO + R2 requieren path-style
  });
  return _client;
}

export function s3Bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET no configurado");
  return b;
}

export async function signPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900, // 15 min
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: s3Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresInSeconds });
}

export function publicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_URL ?? "";
  return `${base.replace(/\/$/, "")}/${key}`;
}
