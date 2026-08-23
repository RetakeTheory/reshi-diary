import { ensureDatabaseSchema, getD1 } from "../../../../db/runtime";
import { sameOrigin } from "../../../../lib/admin-email-auth";
import { displayNameKey, normalizeDisplayName, publicReader, readerFromRequest } from "../../../../lib/reader-auth";

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const user = await readerFromRequest(request);
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { displayName?: string };
  const displayName = normalizeDisplayName(body.displayName || "");
  if ([...displayName].length < 2 || [...displayName].length > 40) return Response.json({ error: "昵称需为 2–40 个字符" }, { status: 400 });
  await ensureDatabaseSchema(); const db = await getD1();
  try {
    await db.prepare("UPDATE users SET display_name = ?, display_name_key = ?, updated_at = ? WHERE id = ?")
      .bind(displayName, displayNameKey(displayName), Date.now(), user.id).run();
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return Response.json({ error: "该昵称已被使用" }, { status: 409 });
    throw error;
  }
  const updated = await readerFromRequest(request);
  return Response.json({ user: publicReader(updated!) }, { headers: { "Cache-Control": "no-store" } });
}
