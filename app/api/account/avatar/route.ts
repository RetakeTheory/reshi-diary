import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { saveUpload } from "../../../../db/uploads";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { publicReader, readerFromRequest } from "../../../../lib/reader-auth";

const accepted = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) return Response.json({ error: "请选择头像图片" }, { status: 400 });
  if (!accepted.has(file.type) || file.size > 3 * 1024 * 1024) {
    return Response.json({ error: "头像需为 JPG、PNG 或 WebP，且不超过 3MB" }, { status: 400 });
  }
  await ensureDatabaseSchema();
  const key = `avatars/${crypto.randomUUID()}.jpg`;
  await saveUpload({ key, filename: "avatar.jpg", contentType: file.type, size: file.size, previewable: true, data: await file.arrayBuffer() });
  const db = await getD1();
  await db.prepare("UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?").bind(key, Date.now(), user.id).run();
  user.avatar_key = key;
  return Response.json({ user: publicReader(user) }, { headers: { "Cache-Control": "no-store" } });
}
