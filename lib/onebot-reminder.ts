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

export function parseReminderCommand(raw: string, now = Date.now()) {
  const value = raw.trim();
  const relative = value.match(/^(\d{1,8})\s*(秒|分钟|小时|天)后\s*提醒我[，,:：\s]*([\s\S]+)$/);
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
