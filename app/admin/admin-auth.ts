import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ChatGPTUser, getChatGPTUser, requireChatGPTUser } from "../chatgpt-auth";
import { getDb } from "../../db";
import { ensureDatabaseSchema } from "../../db/runtime";
import { admins } from "../../db/schema";

export const ADMIN_EMAIL = "reshi1417@163.com";

export async function getAdminAccess(user: ChatGPTUser) {
  await ensureDatabaseSchema();
  const db = await getDb();
  const [existing] = await db.select().from(admins).where(eq(admins.userId, user.userId)).limit(1);
  if (existing) return existing;
  if (user.email.trim().toLowerCase() !== ADMIN_EMAIL) return null;

  try {
    const [admin] = await db.insert(admins).values({
      userId: user.userId,
      email: ADMIN_EMAIL,
      displayName: "reshi",
      createdAt: new Date(),
    }).returning();
    return admin;
  } catch {
    const [admin] = await db.select().from(admins).where(eq(admins.userId, user.userId)).limit(1);
    return admin || null;
  }
}

export async function requireAdmin(returnTo = "/admin") {
  const user = await requireChatGPTUser(returnTo);
  const admin = await getAdminAccess(user);
  if (!admin) redirect("/admin/login?denied=1");
  return { user, admin };
}

export async function getApiAdmin() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const admin = await getAdminAccess(user);
  return admin ? { user, admin } : null;
}
