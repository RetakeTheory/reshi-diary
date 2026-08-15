import { saveUpload } from "../../../../db/uploads";
import { getApiAdmin } from "../../../admin/admin-auth";

const MAX_FILE_SIZE = 1024 * 1024;

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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择要上传的图片" }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "这里只接收图片文件" }, { status: 415 });
  if (file.size > MAX_FILE_SIZE) return Response.json({ error: "单张图片不能超过 1 MB" }, { status: 413 });

  const filename = safeName(file.name);
  const previewable = true;
  const key = `${Date.now()}-${crypto.randomUUID()}`;
  await saveUpload({
    key,
    filename,
    contentType: file.type,
    size: file.size,
    previewable,
    data: await file.arrayBuffer(),
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
