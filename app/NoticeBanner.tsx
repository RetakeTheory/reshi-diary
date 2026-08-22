import { rustBackendFetch } from "../lib/rust-backend";
import NoticeTicker from "./NoticeTicker";
import { ensureDatabaseSchema, getD1 } from "../db/runtime";

type Notice = { id: number; text: string; backgroundColor: string; foregroundColor: string };

async function loadNotice(): Promise<Notice | null> {
  try {
    const response = await rustBackendFetch("/api/notifications/active");
    if (response?.ok) return ((await response.json()) as { notification: Notice | null }).notification;
    await ensureDatabaseSchema();
    const db = await getD1();
    const row = await db.prepare("SELECT id, text, background_color AS backgroundColor FROM notifications WHERE active = 1 ORDER BY updated_at DESC LIMIT 1").first<Omit<Notice, "foregroundColor">>();
    if (!row) return null;
    const value = row.backgroundColor.replace("#", "");
    const rgb = [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16) || 0);
    return { ...row, foregroundColor: rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 155 ? "#171326" : "#FFFFFF" };
  } catch {
    return null;
  }
}

export default async function NoticeBanner() {
  const notice = await loadNotice();
  if (!notice) return null;
  return <NoticeTicker notice={notice} />;
}
