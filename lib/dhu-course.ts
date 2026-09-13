export type DhuTaskStatus = "scheduled" | "watching" | "needs_login" | "submitted" | "success" | "failed" | "cancelled";

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
};

export const DHU_LOGIN_URL = "https://webproxy.dhu.edu.cn/login";
export const WATCH_WINDOW_MS = 10 * 60_000;
export const RETRY_INTERVAL_MS = 60_000;
export const PREFLIGHT_MS = 5 * 60_000;

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
