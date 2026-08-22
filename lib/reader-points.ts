import { ensureDatabaseSchema, getD1 } from "../db/runtime";
import { DAILY_TASKS, type DailyTask, readerDayKey } from "./reader-levels";

export async function awardDailyPoints(userId: string, task: DailyTask) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const points = DAILY_TASKS.find((item) => item.key === task)?.points || 0;
  const now = Date.now();
  const created = await db.prepare(`INSERT INTO point_events (user_id, task, day_key, points, created_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, task, day_key) DO NOTHING RETURNING id`)
    .bind(userId, task, readerDayKey(now), points, now).first<{ id: number }>();
  if (!created) return false;
  await db.prepare("UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?")
    .bind(points, now, userId).run();
  return true;
}

export async function dailyTaskState(userId: string) {
  await ensureDatabaseSchema();
  const db = await getD1();
  const rows = await db.prepare("SELECT task FROM point_events WHERE user_id = ? AND day_key = ?")
    .bind(userId, readerDayKey()).all<{ task: DailyTask }>();
  const completed = new Set((rows.results || []).map((row) => row.task));
  return DAILY_TASKS.map((task) => ({ ...task, completed: completed.has(task.key) }));
}
