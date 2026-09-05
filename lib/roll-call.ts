export type RollCallConfig = { title: string; names: string[]; required: string[]; count: number; cursor: number; mode: "random" | "preset"; drawn: string[]; revision: number };
export type RollCallRecord = RollCallConfig & { id: string; results: string[]; nextCursor: number; createdAt: number; source: "draw" | "import" };
export class RollCallInputError extends Error {}

export function parseNames(value: unknown): string[] {
  const parts = typeof value === "string" ? value.replace(/^\uFEFF/, "").split(/[\r\n,，、;；\t]+/) : value;
  if (!Array.isArray(parts) || parts.length > 5000 || parts.some((part) => typeof part !== "string")) throw new RollCallInputError("名单格式无效，支持文本或姓名数组");
  const names = [...new Set(parts.map((name: string) => name.trim().normalize("NFC")).filter(Boolean))];
  if (names.length > 1000 || names.some((name) => name.length > 80)) throw new RollCallInputError("最多 1000 人，每个名字最多 80 字");
  return names;
}

export function normalizeRollCall(value: unknown): RollCallConfig {
  if (!value || typeof value !== "object") throw new RollCallInputError("点名配置无效");
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const names = parseNames(input.names);
  const required = parseNames(input.required ?? []);
  const count = input.count;
  if (!title || title.length > 100) throw new RollCallInputError("请输入 1–100 字的名单名称");
  if (!names.length) throw new RollCallInputError("请先导入花名册");
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > names.length) throw new RollCallInputError("点名人数必须是正整数，且不能超过名单人数");
  if (required.some((name) => !names.includes(name))) throw new RollCallInputError("必选名单中的每个人都必须在花名册中");
  const cursor = input.cursor ?? 0;
  if (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0 || cursor > required.length) throw new RollCallInputError("预设顺序进度无效");
  const mode = input.mode ?? "random";
  if (mode !== "random" && mode !== "preset") throw new RollCallInputError("请选择随机或内定模式");
  const drawn = parseNames(input.drawn ?? []);
  if (drawn.some((name) => !names.includes(name))) throw new RollCallInputError("本轮已点名单无效");
  if (mode === "preset" && !required.length) throw new RollCallInputError("内定模式需要先设置指定名单和顺序");
  const revision = input.revision ?? 0;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new RollCallInputError("名单版本无效");
  return { title, names, required, count, cursor, mode, drawn, revision };
}

function randomIndex(max: number) {
  const ceiling = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= ceiling);
  return buffer[0] % max;
}

function shuffle(names: string[]) {
  const shuffled = [...names];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function drawRollCall(config: RollCallConfig) {
  const valid = normalizeRollCall(config);
  const available = valid.mode === "preset" ? valid.required.slice(valid.cursor) : valid.names.filter((name) => !valid.drawn.includes(name));
  if (available.length < valid.count) throw new RollCallInputError(available.length ? "本轮剩余人数不足，请减少点名人数或开启新一轮" : "本轮名单已点完，请开启新一轮");
  return (valid.mode === "preset" ? available : shuffle(available)).slice(0, valid.count);
}

export function normalizeHistoryImport(value: unknown): RollCallRecord[] {
  if (!value || typeof value !== "object") throw new RollCallInputError("请导入点名器导出的 JSON 文件");
  const input = value as { version?: unknown; records?: unknown };
  if (input.version !== 1 || !Array.isArray(input.records) || !input.records.length || input.records.length > 50) throw new RollCallInputError("每次可导入 1–50 条历史记录（version: 1）");
  return input.records.map((raw) => {
    const config = normalizeRollCall(raw);
    const results = parseNames(raw.results);
    const expected = config.mode === "preset" ? config.required.slice(config.cursor, config.cursor + config.count) : [];
    if (!Array.isArray(raw.results) || raw.results.length !== results.length || results.length !== config.count || results.some((name) => !config.names.includes(name)) || (config.mode === "preset" && expected.length !== config.count) || expected.some((name, index) => results[index] !== name) || (config.mode === "random" && results.some((name) => config.drawn.includes(name)))) throw new RollCallInputError("历史结果与花名册或指定顺序不匹配");
    if (!Number.isSafeInteger(raw.createdAt) || raw.createdAt <= 0 || raw.createdAt > Date.now() + 60000) throw new RollCallInputError("历史记录时间无效");
    return { ...config, results, nextCursor: config.cursor + expected.length, createdAt: raw.createdAt, id: crypto.randomUUID(), source: "import" as const };
  });
}
