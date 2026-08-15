import { findUpload, uploadBody } from "../../../../db/uploads";

type RouteContext = { params: Promise<{ key: string[] }> };

function contentDisposition(filename: string, inline: boolean) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request, context: RouteContext) {
  const key = (await context.params).key.join("/");
  const object = await findUpload(key);
  if (!object) return new Response("文件不存在", { status: 404 });

  const filename = object.filename || "attachment";
  const allowPreview = object.previewable === 1;
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("Content-Type", object.content_type || "application/octet-stream");
  headers.set("Content-Disposition", contentDisposition(filename, allowPreview && !wantsDownload));
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.size) headers.set("Content-Length", String(object.size));
  return new Response(uploadBody(object.data), { headers });
}
