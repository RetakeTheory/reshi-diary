import { putS3Object } from "../../../../lib/s3-storage";
import { getApiAdmin } from "../../../admin/admin-auth";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const PREVIEWABLE_TYPES = new Set(["application/pdf", "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp", "text/plain"]);

function safeName(value: string) {
  const withoutControlCharacters = [...value.normalize("NFKC")]
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
    .join("");
  return withoutControlCharacters.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "attachment";
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function POST(request: Request) {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 1024 * 1024) {
    return Response.json({ error: "单个文件不能超过 20 MB" }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: "单个文件不能超过 20 MB" }, { status: 413 });

  const filename = safeName(file.name);
  const previewable = PREVIEWABLE_TYPES.has(file.type) && (file.type.startsWith("image/") || form.get("previewable") === "true");
  const key = `uploads/${Date.now()}-${crypto.randomUUID()}`;
  let response: Response;
  try {
    response = await putS3Object(key, {
      body: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
      filename,
      previewable,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "s3_upload_error", reason: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "S3 存储尚未正确配置" }, { status: 503 });
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: "s3_upload_failed", status: response.status }));
    return Response.json({ error: "上传到 S3 失败，请检查存储桶权限" }, { status: 502 });
  }
  const url = `/api/files/${encodeKey(key)}`;
  return Response.json({
    name: filename,
    url,
    downloadUrl: `${url}?download=1`,
    type: file.type || "application/octet-stream",
    size: file.size,
    previewable,
    isImage: file.type.startsWith("image/"),
  }, { status: 201 });
}
