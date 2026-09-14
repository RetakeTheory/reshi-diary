export type DhuTaskStatus = "scheduled" | "watching" | "needs_login" | "paused" | "submitted" | "success" | "failed" | "cancelled";

export type DhuTask = {
  id: string;
  courseCode: string;
  sectionNumber: string;
  coursePageUrl?: string;
  buyMaterial: boolean;
  scheduledAt: number;
  nextAt: number;
  status: DhuTaskStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
  attempts?: number;
  lastAttemptAt?: number;
};

export type DhuCourseOption = { courseCode: string; name: string; status: string };
export type DhuSectionOption = {
  courseCode: string;
  sectionNumber: string;
  classNumber: string;
  capacity: number;
  applicants: number;
  admitted: number;
  teacher: string;
  schedule: string;
  location: string;
};
export type DhuSessionHealth = {
  checkedAt: number;
  active: boolean;
  loginRequired: boolean;
  message: string;
};
export type DhuSubmissionRecord = {
  id: string;
  username: string;
  taskId: string;
  courseCode: string;
  sectionNumber: string;
  buyMaterial: boolean;
  scheduledAt: number;
  recordedAt: number;
  outcome: "not_sent" | "accepted" | "rejected" | "unknown";
  message: string;
  attempt?: number;
};

export const DHU_LOGIN_URL = "https://webproxy.dhu.edu.cn/login";
export const WATCH_WINDOW_MS = 10 * 60_000;
export const RETRY_INTERVAL_MS = 2_000;
export const MAX_SUBMISSION_ATTEMPTS = 10;
export const PREFLIGHT_MS = 5 * 60_000;

export function planDhuSubmission(task: DhuTask, now: number):
  { action: "wait"; nextAt: number } | { action: "send"; attempt: number } | { action: "stop" } {
  if (!["scheduled", "watching", "submitted"].includes(task.status)) return { action: "stop" };
  const earliest = Math.max(task.scheduledAt, (task.lastAttemptAt || 0) + RETRY_INTERVAL_MS);
  if (now < earliest) return { action: "wait", nextAt: earliest };
  if ((task.attempts || 0) >= MAX_SUBMISSION_ATTEMPTS) return { action: "stop" };
  return { action: "send", attempt: (task.attempts || 0) + 1 };
}

export function applyDhuSubmissionResult(task: DhuTask, attemptedAt: number,
  result: "success" | "retry", message: string): DhuTask {
  const attempts = (task.attempts || 0) + 1;
  return {
    ...task, attempts, lastAttemptAt: attemptedAt, updatedAt: attemptedAt,
    status: result === "success" ? "success" : attempts >= MAX_SUBMISSION_ATTEMPTS ? "failed" : "watching",
    nextAt: result === "success" || attempts >= MAX_SUBMISSION_ATTEMPTS ? 0 : attemptedAt + RETRY_INTERVAL_MS,
    message,
  };
}

export function normalizeDhuTask(input: unknown, now = Date.now()): DhuTask {
  if (!input || typeof input !== "object") throw new Error("请填写课程信息");
  const data = input as Record<string, unknown>;
  const courseCode = String(data.courseCode || "").trim();
  const sectionNumber = String(data.sectionNumber || "").trim();
  const scheduledAt = Number(data.scheduledAt);
  if (!/^\d{6,12}$/.test(courseCode)) throw new Error("课程编号应为 6–12 位数字");
  if (!/^\d{6,12}$/.test(sectionNumber)) throw new Error("选课序号应为 6–12 位数字");
  if (!Number.isSafeInteger(scheduledAt) || scheduledAt < now + 30_000 || scheduledAt > now + 30 * 86_400_000) {
    throw new Error("请选择未来 30 秒至 30 天内的报名时间");
  }
  if (typeof data.buyMaterial !== "boolean") throw new Error("请明确选择是否购买教材");
  return {
    id: crypto.randomUUID(), courseCode, sectionNumber, scheduledAt,
    buyMaterial: data.buyMaterial, nextAt: Math.max(now + 1000, scheduledAt - PREFLIGHT_MS),
    status: "scheduled", message: "等待预约时间", createdAt: now, updatedAt: now,
  };
}

export function isSchoolCoursePage(url: string, hasList: boolean): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "webproxy.dhu.edu.cn"
      && parsed.pathname.includes("/dhu/selectcourse/") && hasList;
  } catch { return false; }
}

export function classifySchoolResult(messages: string[]): "success" | "failed" | "unknown" {
  const text = messages.join("\n");
  if (/失败|错误|冲突|已满|不能|不允许|未开放|验证码|重新登录/.test(text)) return "failed";
  if (/选课成功|报名成功|选课申请成功|已成功选课|录取成功/.test(text)) return "success";
  return "unknown";
}

function cellText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

export function parseDhuCourseOptions(html: string): DhuCourseOption[] {
  const table = html.match(/<table\b[^>]*\bid=["']tsCoursesTbl["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return [];
  const courses: DhuCourseOption[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 5) continue;
    const code = cells[1].match(/<a\b[^>]*>\s*(\d{6,12})\s*<\/a>/i)?.[1];
    if (!code) continue;
    courses.push({ courseCode: code, name: cellText(cells[2]), status: cellText(cells[4]) });
  }
  return courses;
}

export function parseDhuSectionOptions(html: string): DhuSectionOption[] {
  const courseCode = html.match(/id=["']curCourseCode["'][^>]*>\s*(\d{6,12})\s*</i)?.[1];
  const table = html.match(/<table\b[^>]*\bid=["']accessClassTbl["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!courseCode || !table) return [];
  const sections: DhuSectionOption[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 10) continue;
    const sectionNumber = cells[0].match(/<a\b[^>]*>\s*(\d{6,12})\s*<\/a>/i)?.[1];
    if (!sectionNumber || !/openSCC\s*\(/i.test(cells[0])) continue;
    const number = (cell: string) => Number(cellText(cell));
    sections.push({
      courseCode, sectionNumber, classNumber: cellText(cells[1]),
      capacity: number(cells[2]), applicants: number(cells[3]), admitted: number(cells[4]),
      teacher: cellText(cells[6]), schedule: `${cellText(cells[7])} ${cellText(cells[8])}`.trim(),
      location: cellText(cells[9]),
    });
  }
  return sections;
}
