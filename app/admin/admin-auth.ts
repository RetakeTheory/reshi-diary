import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getD1 } from "../../db/runtime";
import { ensureDatabaseSchema } from "../../db/runtime";
import { ADMIN_EMAIL, ADMIN_SESSION_COOKIE, hashValue } from "../../lib/admin-email-auth";

export { ADMIN_EMAIL } from "../../lib/admin-email-auth";

export async function getAdminSession() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureDatabaseSchema();
  const db = await getD1();
  const tokenHash = await hashValue(token);
  const session = await db.prepare("SELECT email, expires_at FROM admin_sessions WHERE token_hash = ? LIMIT 1")
    .bind(tokenHash).first<{ email: string; expires_at: number }>();
  if (!session || session.email !== ADMIN_EMAIL || session.expires_at <= Date.now()) {
    if (session) await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { email: session.email, displayName: "reshi", tokenHash };
}

export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return { admin };
}

export async function getApiAdmin() {
  const admin = await getAdminSession();
  return admin ? { admin } : null;
}
