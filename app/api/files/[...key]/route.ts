import { findUpload, uploadBody } from "../../../../db/uploads";
import { previewModeFor } from "../../../../lib/file-preview";
import { decodeS3Filename, getS3Object } from "../../../../lib/s3-storage";
import { getApiAdmin } from "../../../admin/admin-auth";

type RouteContext = { params: Promise<{ key: string[] }> };

function contentDisposition(filename: string, inline: boolean) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request, context: RouteContext) {
  const key = (await context.params).key.join("/");
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  let s3Response: Response | null = null;
  if (key.startsWith("survey-files/") && !await getApiAdmin()) return new Response("请先登录管理员账户", { status: 401 });
  if (key.startsWith("uploads/") || key.startsWith("survey-files/")) {
    try {
      s3Response = await getS3Object(key, request.headers.get("range"));
    } catch (error) {
      console.error(JSON.stringify({ event: "s3_download_error", reason: error instanceof Error ? error.message : "unknown" }));
    }
  }
  if (s3Response?.ok) {
    const filename = decodeS3Filename(s3Response.headers.get("x-amz-meta-filename"));
    const contentType = s3Response.headers.get("content-type") || "application/octet-stream";
    const allowPreview = s3Response.headers.get("x-amz-meta-previewable") === "1" || previewModeFor(contentType, filename) === "image";
    const headers = new Headers();
    for (const name of ["accept-ranges", "cache-control", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
      const value = s3Response.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", contentDisposition(filename, allowPreview && !wantsDownload));
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(s3Response.body, { status: s3Response.status, headers });
  }
  if (s3Response && s3Response.status !== 404) {
    console.error(JSON.stringify({ event: "s3_download_failed", status: s3Response.status }));
    return new Response("暂时无法读取文件", { status: 502 });
  }

  // Historical uploads remain readable from D1 after switching new files to S3.
  const object = await findUpload(key);
  if (!object) return new Response("文件不存在", { status: 404 });

  const filename = object.filename || "attachment";
  const allowPreview = object.previewable === 1 || previewModeFor(object.content_type, filename) === "image";
  const headers = new Headers();
  headers.set("Content-Type", object.content_type || "application/octet-stream");
  headers.set("Content-Disposition", contentDisposition(filename, allowPreview && !wantsDownload));
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.size) headers.set("Content-Length", String(object.size));
  return new Response(uploadBody(object.data), { headers });
}
