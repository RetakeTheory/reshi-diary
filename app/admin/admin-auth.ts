import { eq } from "drizzle-orm";
import { getChatGPTUser, requireChatGPTUser } from "../chatgpt-auth";
import { getDb } from "../../db";
import { ensureDatabaseSchema } from "../../db/runtime";
import { admins } from "../../db/schema";

export async function requireAdmin(returnTo = "/admin") {
  const user = await requireChatGPTUser(returnTo);
  await ensureDatabaseSchema();
  const db = await getDb();
  const existing = await db.select().from(admins).limit(1);

  if (existing.length === 0) {
    const [admin] = await db.insert(admins).values({
      userId: user.userId,
      email: user.email,
      displayName: "reshi",
      createdAt: new Date(),
    }).returning();
    return { user, admin };
  }

  const [admin] = await db.select().from(admins).where(eq(admins.userId, user.userId)).limit(1);
  if (!admin) throw new Error("你没有访问此后台的权限。");
  return { user, admin };
}

export async function getApiAdmin() {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureDatabaseSchema();
  const db = await getDb();
  const [admin] = await db.select().from(admins).where(eq(admins.userId, user.userId)).limit(1);
  return admin ? { user, admin } : null;
}
