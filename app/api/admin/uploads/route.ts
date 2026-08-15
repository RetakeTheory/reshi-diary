import { getFilesBucket } from "../../../../db/files";
import { getApiAdmin } from "../../../admin/admin-auth";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function safeName(value: string) {
  return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "attachment";
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function POST(request: Request) {
  const auth = await getApiAdmin();
  if (!auth) return Response.json({ error: "未登录或没有管理员权限" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: "单个文件不能超过 20 MB" }, { status: 413 });

  const filename = safeName(file.name);
  const previewable = form.get("previewable") === "true";
  const key = `uploads/${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const bucket = await getFilesBucket();
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename, previewable: previewable ? "true" : "false" },
  });
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
