const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_REMINDER_MS = 366 * 24 * 60 * 60 * 1000;

function validChinaDate(year: number, month: number, day: number, hour: number, minute: number) {
  const dueAt = Date.UTC(year, month - 1, day, hour - 8, minute);
  const check = new Date(dueAt + CHINA_OFFSET_MS);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) return null;
  return dueAt;
}

function parseClock(hourValue: string | undefined, minuteValue: string | undefined) {
  const hour = hourValue === undefined ? 9 : Number(hourValue);
  const minute = minuteValue === undefined || minuteValue === "" ? 0 : Number(minuteValue);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59
    ? { hour, minute }
    : null;
}

function parseChineseHour(value: string) {
  if (/^\d{1,2}$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.startsWith("十") && value.length === 2 && digits[value[1]]) return 10 + digits[value[1]];
  if (value.length === 1 && digits[value]) return digits[value];
  return Number.NaN;
}

function parseNaturalClock(period: string | undefined, hourValue: string, minuteWord: string | undefined, minuteValue: string | undefined) {
  let hour = parseChineseHour(hourValue);
  const minute = minuteWord === "半" ? 30 : minuteWord === "一刻" ? 15 : minuteWord === "三刻" ? 45
    : minuteValue === undefined || minuteValue === "" ? 0 : Number(minuteValue);
  const maximumHour = period ? 12 : 23;
  if (!Number.isInteger(hour) || hour < (period ? 1 : 0) || hour > maximumHour
    || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (period === "上午") hour = hour === 12 ? 0 : hour;
  else if (period === "下午" || period === "晚上") hour = hour === 12 ? 12 : hour + 12;
  return { hour, minute };
}

export function formatChinaTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function groupReminderCommand(raw: string, botId: string) {
  return raw.replace(new RegExp(`^(?:\\[CQ:at,qq=${botId}\\]\\s*)+`, "i"), "").trim();
}

export function oneBotMessageText(rawMessage: unknown, message: unknown) {
  if (typeof rawMessage === "string" && rawMessage.trim()) return rawMessage;
  if (typeof message === "string") return message;
  if (!Array.isArray(message)) return "";
  return message.map((segment) => {
    if (!segment || typeof segment !== "object" || Array.isArray(segment)) return "";
    const candidate = segment as { type?: unknown; data?: unknown };
    if (!candidate.data || typeof candidate.data !== "object" || Array.isArray(candidate.data)) return "";
    const data = candidate.data as Record<string, unknown>;
    if (candidate.type === "text") return typeof data.text === "string" ? data.text : "";
    if (candidate.type === "at") {
      const qq = typeof data.qq === "string" || typeof data.qq === "number" ? String(data.qq) : "";
      return qq ? `[CQ:at,qq=${qq}]` : "";
    }
    return "";
  }).join("");
}

export function parseReminderCommand(raw: string, now = Date.now()) {
  const value = raw.trim();
  const relative = value.match(/^(\d{1,8})\s*个?\s*(秒|分钟|小时|天)后\s*提醒我[，,:：\s]*([\s\S]+)$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = relative[2] === "秒" ? 1000 : relative[2] === "分钟" ? 60_000 : relative[2] === "小时" ? 3_600_000 : 86_400_000;
    const delay = amount * unitMs;
    const text = relative[3].trim();
    if (amount < 1 || delay > MAX_REMINDER_MS || !text || [...text].length > 500) return null;
    return { dueAt: now + delay, text };
  }

  const tomorrow = value.match(/^明天(?:\s*(\d{1,2})(?:\s*(?:点|时|[:：])\s*(\d{1,2})?)?(?:\s*分)?)?\s*提醒我[，,:：\s]*([\s\S]+)$/);
  if (tomorrow) {
    const clock = parseClock(tomorrow[1], tomorrow[2]);
    const text = tomorrow[3].trim();
    if (!clock || !text || [...text].length > 500) return null;
    const localNow = new Date(now + CHINA_OFFSET_MS);
    const tomorrowDate = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1));
    const dueAt = validChinaDate(tomorrowDate.getUTCFullYear(), tomorrowDate.getUTCMonth() + 1, tomorrowDate.getUTCDate(), clock.hour, clock.minute);
    return dueAt ? { dueAt, text } : null;
  }

  const naturalClock = value.match(/^(?:(\d{1,2})(?:月|\/)(\d{1,2})(?:日)?\s*)?(?:(上午|下午|晚上)\s*)?(\d{1,2}|[一二两三四五六七八九十]{1,2})\s*(?:点|时|[:：])\s*(?:(半|一刻|三刻)|(?:(\d{1,2})\s*分?))?\s*提醒我[，,:：\s]*([\s\S]+)$/);
  if (naturalClock) {
    const clock = parseNaturalClock(naturalClock[3], naturalClock[4], naturalClock[5], naturalClock[6]);
    const text = naturalClock[7].trim();
    if (!clock || !text || [...text].length > 500) return null;
    const localNow = new Date(now + CHINA_OFFSET_MS);
    const hasDate = naturalClock[1] !== undefined && naturalClock[2] !== undefined;
    const month = hasDate ? Number(naturalClock[1]) : localNow.getUTCMonth() + 1;
    const day = hasDate ? Number(naturalClock[2]) : localNow.getUTCDate();
    let year = localNow.getUTCFullYear();
    let dueAt = validChinaDate(year, month, day, clock.hour, clock.minute);
    if (hasDate && dueAt !== null && dueAt <= now) dueAt = validChinaDate(++year, month, day, clock.hour, clock.minute);
    if (dueAt === null || dueAt <= now || dueAt - now > MAX_REMINDER_MS) return null;
    return { dueAt, text };
  }

  const fixed = value.match(/^(\d{1,2})(?:月|\/)(\d{1,2})(?:日)?(?:\s+(\d{1,2})(?:\s*(?:点|时|[:：])\s*(\d{1,2})?)?(?:\s*分)?)?\s*提醒我[，,:：\s]*([\s\S]+)$/);
  if (!fixed) return null;
  const month = Number(fixed[1]);
  const day = Number(fixed[2]);
  const clock = parseClock(fixed[3], fixed[4]);
  const text = fixed[5].trim();
  if (!clock || !text || [...text].length > 500) return null;
  const localNow = new Date(now + CHINA_OFFSET_MS);
  let year = localNow.getUTCFullYear();
  let dueAt = validChinaDate(year, month, day, clock.hour, clock.minute);
  if (dueAt !== null && dueAt <= now) dueAt = validChinaDate(++year, month, day, clock.hour, clock.minute);
  if (dueAt === null || dueAt - now > MAX_REMINDER_MS) return null;
  return { dueAt, text };
}
