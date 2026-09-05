import { getD1 } from "../../../db/runtime";
import { readerFromRequest } from "../../../lib/reader-auth";
import { sameOrigin } from "../../../lib/admin-email-auth";
import { drawRollCall, normalizeHistoryImport, normalizeRollCall, RollCallInputError } from "../../../lib/roll-call";
import { ensureRollCallSchema, queryRollCallHistory, saveRollCallList, saveRollCallRecord } from "../../../lib/roll-call-store";

const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof RollCallInputError || error instanceof SyntaxError) return Response.json({ error: error instanceof SyntaxError ? "JSON 格式无效" : error.message }, { status: 400, headers });
  console.error("Roll call request failed", error);
  return Response.json({ error: "点名数据暂时无法读取或保存，请稍后重试" }, { status: 503, headers });
}

export async function GET(request: Request) {
  try {
    const user = await readerFromRequest(request);
    if (!user) return Response.json({ error: "请先登录，名单与历史仅自己可见" }, { status: 401, headers });
    const db = await getD1(); await ensureRollCallSchema(db);
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "lists") {
      const rows = await db.prepare("SELECT config_json FROM roll_call_lists WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all<{ config_json: string }>();
      return Response.json({ lists: rows.results.map((row) => JSON.parse(row.config_json)) }, { headers });
    }
    const page = Number(params.get("page") || 1);
    const from = Number(params.get("from") || 0); const to = Number(params.get("to") || Number.MAX_SAFE_INTEGER);
    const q = (params.get("q") || "").trim();
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || q.length > 100) throw new RollCallInputError("查询条件无效");
    return Response.json(await queryRollCallHistory(db, user.id, { q, from, to, page }), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403, headers });
  try {
    const user = await readerFromRequest(request);
    if (!user) return Response.json({ error: "请先登录，名单与历史仅自己可见" }, { status: 401, headers });
    // Bound the stream before JSON parsing, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new RollCallInputError("请求内容为空");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new RollCallInputError("导入内容不能超过 2 MB"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object") throw new RollCallInputError("请求内容无效");
    const db = await getD1(); await ensureRollCallSchema(db);
    if (body.action === "import") {
      const records = normalizeHistoryImport(body.data);
      await db.batch(records.map((record) => db.prepare("INSERT INTO roll_call_history (id, owner_id, title, record_json, created_at) VALUES (?, ?, ?, ?, ?)").bind(record.id, user.id, record.title, JSON.stringify(record), record.createdAt)));
      return Response.json({ imported: records.length }, { headers });
    }
    const config = normalizeRollCall(body.config);
    if (body.action === "save") {
      const saved = await saveRollCallList(db, user.id, config);
      return Response.json({ config: saved }, { headers });
    }
    if (body.action !== "draw" || typeof body.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(body.requestId)) throw new RollCallInputError("点名请求无效");
    const record = await saveRollCallRecord(db, user.id, { ...config, id: body.requestId, results: drawRollCall(config), nextCursor: config.mode === "preset" ? config.cursor + config.count : config.cursor, createdAt: Date.now(), source: "draw" });
    return Response.json({ record }, { headers });
  } catch (error) { return failure(error); }
}
