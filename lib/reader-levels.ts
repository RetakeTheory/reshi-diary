export const LEVEL_COLORS = [
  "#64748B", "#2F80ED", "#0EA5A4", "#16A34A",
  "#65A30D", "#CA8A04", "#EA580C", "#E11D48",
  "#DB2777", "#C026D3", "#9333EA", "#7C3AED",
  "#4F46E5", "#2563EB", "#0891B2", "#B45309",
] as const;

export type DailyTask = "check_in" | "comment" | "reaction";

export const DAILY_TASKS: ReadonlyArray<{ key: DailyTask; label: string; points: number }> = [
  { key: "check_in", label: "每日签到", points: 2 },
  { key: "comment", label: "发表评论", points: 3 },
  { key: "reaction", label: "添加回应", points: 3 },
];

export function readerLevel(points: number) {
  return Math.min(16, Math.max(1, Math.floor(Math.max(0, points) / 100) + 1));
}

export function readerLevelColor(level: number) {
  return LEVEL_COLORS[Math.min(16, Math.max(1, level)) - 1];
}

export function readerDayKey(now = Date.now()) {
  return Math.floor((now + 8 * 60 * 60 * 1000) / 86_400_000);
}
