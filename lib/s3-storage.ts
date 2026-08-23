import { env } from "cloudflare:workers";
import { AwsClient } from "aws4fetch";

type S3Upload = {
  body: ArrayBuffer;
  contentType: string;
  filename: string;
  previewable: boolean;
};

function configuration() {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  const region = env.AWS_REGION;
  const bucket = env.AWS_S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !region || !bucket) throw new Error("S3_STORAGE_NOT_CONFIGURED");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z0-9-]+$/.test(region)) throw new Error("S3_STORAGE_INVALID_CONFIGURATION");
  return { accessKeyId, secretAccessKey, sessionToken: env.AWS_SESSION_TOKEN, region, bucket };
}

function objectUrl(bucket: string, region: string, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (bucket.includes(".")) return `https://s3.${region}.amazonaws.com/${bucket}/${encodedKey}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function client(retries: number) {
  const config = configuration();
  return {
    config,
    aws: new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
      service: "s3",
      region: config.region,
      retries,
    }),
  };
}

export async function putS3Object(key: string, upload: S3Upload) {
  const { aws, config } = client(0);
  return aws.fetch(objectUrl(config.bucket, config.region, key), {
    method: "PUT",
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": upload.contentType,
      "X-Amz-Meta-Filename": encodeURIComponent(upload.filename),
      "X-Amz-Meta-Previewable": upload.previewable ? "1" : "0",
    },
    body: upload.body,
  });
}

export async function presignS3PutObject(key: string, upload: Omit<S3Upload, "body">, expiresInSeconds = 900) {
  const { aws, config } = client(0);
  const headers = new Headers({
    "Content-Type": upload.contentType,
    "X-Amz-Meta-Filename": encodeURIComponent(upload.filename),
    "X-Amz-Meta-Previewable": upload.previewable ? "1" : "0",
  });
  const target = new URL(objectUrl(config.bucket, config.region, key));
  target.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await aws.sign(target, { method: "PUT", headers, aws: { signQuery: true } });
  return { uploadUrl: signed.url, headers: Object.fromEntries(headers.entries()), expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export async function getS3Object(key: string, range?: string | null) {
  const { aws, config } = client(2);
  const headers = new Headers();
  if (range) headers.set("Range", range);
  return aws.fetch(objectUrl(config.bucket, config.region, key), { headers });
}

export async function headS3Object(key: string) {
  const { aws, config } = client(2);
  return aws.fetch(objectUrl(config.bucket, config.region, key), { method: "HEAD" });
}

export async function deleteS3Object(key: string) {
  const { aws, config } = client(2);
  return aws.fetch(objectUrl(config.bucket, config.region, key), { method: "DELETE" });
}

export function decodeS3Filename(value: string | null) {
  if (!value) return "attachment";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
