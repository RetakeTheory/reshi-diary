import test from "node:test";
import assert from "node:assert/strict";
import { drawRollCall, normalizeRollCall, normalizeHistoryImport, parseNames } from "../lib/roll-call.ts";
import { ensureRollCallSchema, saveRollCallList, saveRollCallRecord, queryRollCallHistory } from "../lib/roll-call-store.ts";
import { sqliteD1 } from "./sqlite-d1.mjs";

const base = () => normalizeRollCall({ title: "一班", names: ["张三", "李四", "王五", "赵六"], required: ["王五", "张三"], count: 1 });
const record = (config, time = Date.now()) => ({ ...config, id: crypto.randomUUID(), results: drawRollCall(config), nextCursor: config.mode === "preset" ? config.cursor + config.count : config.cursor, createdAt: time, source: "draw" });
const query = { q: "", from: 0, to: Number.MAX_SAFE_INTEGER, page: 1 };

test("text imports preserve order and deduplicate, invalid names and counts are rejected", () => {
  assert.deepEqual(parseNames("\uFEFF张三\n李四，王五、张三\t 赵六 "), ["张三", "李四", "王五", "赵六"]);
  for (const input of [{ count: 0 }, { count: 1.5 }, { count: 5 }, { required: ["外人"] }, { mode: "invalid" }, { mode: "preset", required: [] }, { cursor: -1 }, { drawn: ["外人"] }]) assert.throws(() => normalizeRollCall({ ...base(), ...input }));
  assert.throws(() => parseNames(["a".repeat(81)]));
});

test("preset mode strictly follows the queue, never selects outsiders and stops at the end", () => {
  const config = { ...base(), mode: "preset" };
  assert.deepEqual(drawRollCall(config), ["王五"]);
  assert.deepEqual(drawRollCall({ ...config, cursor: 1 }), ["张三"]);
  assert.deepEqual(drawRollCall({ ...config, count: 2 }), ["王五", "张三"]);
  assert.throws(() => drawRollCall({ ...config, cursor: 2 }), /已点完/);
  assert.throws(() => drawRollCall({ ...config, cursor: 1, count: 2 }), /剩余人数不足/);
});

test("random mode has no repeats within a complete round, ignoring preset restrictions", () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    let config = base();
    for (let i = 0; i < 4; i++) { const selected = drawRollCall(config); assert.equal(selected.length, 1); assert.ok(!config.drawn.includes(selected[0])); config = { ...config, drawn: [...config.drawn, ...selected] }; }
    assert.deepEqual([...config.drawn].sort(), [...config.names].sort());
    assert.throws(() => drawRollCall(config), /已点完/);
  }
});

test("history JSON round-trips preserve order and progress and reject forged results", () => {
  const original = record({ ...base(), mode: "preset", cursor: 1 });
  const imported = normalizeHistoryImport(JSON.parse(JSON.stringify({ version: 1, records: [original] })))[0];
  assert.deepEqual(imported.results, ["张三"]); assert.equal(imported.nextCursor, 2); assert.equal(imported.source, "import"); assert.notEqual(imported.id, original.id);
  for (const results of [["李四"], ["外人"], ["张三", "张三"]]) assert.throws(() => normalizeHistoryImport({ version: 1, records: [{ ...original, results }] }));
  assert.throws(() => normalizeHistoryImport({ version: 1, records: [] }));
});

test("D1 saves draw and progress atomically, isolates accounts, rejects stale draws and deduplicates retries", async () => {
  const db = sqliteD1();
  try {
    await ensureRollCallSchema(db); await ensureRollCallSchema(db);
    const saved = await saveRollCallList(db, "owner-a", { ...base(), mode: "preset" });
    assert.equal(saved.revision, 1);
    const first = record(saved);
    assert.deepEqual(await saveRollCallRecord(db, "owner-a", first), first);
    assert.deepEqual(await saveRollCallRecord(db, "owner-a", { ...first, results: ["BAD"] }), first);
    await assert.rejects(saveRollCallRecord(db, "owner-a", record(saved)), /其他页面更新/);
    const list = JSON.parse(db.sqlite.prepare("SELECT config_json FROM roll_call_lists WHERE owner_id = ?").get("owner-a").config_json);
    assert.equal(list.cursor, 1); assert.equal(list.revision, 2);
    const second = record(list); await saveRollCallRecord(db, "owner-a", second);
    const restored = JSON.parse(db.sqlite.prepare("SELECT config_json FROM roll_call_lists WHERE owner_id = ?").get("owner-a").config_json);
    assert.throws(() => drawRollCall(restored), /已点完/);
    assert.equal((await queryRollCallHistory(db, "owner-a", query)).total, 2);
    assert.equal((await queryRollCallHistory(db, "owner-b", query)).total, 0);
    assert.equal((await queryRollCallHistory(db, "owner-a", { ...query, q: "' OR 1=1 --" })).total, 0);
    assert.equal((await queryRollCallHistory(db, "owner-a", { ...query, from: Date.now() + 1000 })).total, 0);
  } finally { db.sqlite.close(); }
});

test("history query paginates in stable order and filters by name and date", async () => {
  const db = sqliteD1();
  try {
    await ensureRollCallSchema(db);
    for (let i = 0; i < 23; i++) await saveRollCallRecord(db, "owner", record({ ...base(), title: `班级 ${i}` }, 1000 + i));
    const first = await queryRollCallHistory(db, "owner", query); const second = await queryRollCallHistory(db, "owner", { ...query, page: 2 });
    assert.equal(first.records.length, 20); assert.equal(second.records.length, 3); assert.equal(first.total, 23);
    assert.equal(new Set([...first.records, ...second.records].map((r) => r.id)).size, 23);
    assert.equal((await queryRollCallHistory(db, "owner", { ...query, q: "班级 22" })).total, 1);
    assert.equal((await queryRollCallHistory(db, "owner", { ...query, from: 1010, to: 1015 })).total, 6);
  } finally { db.sqlite.close(); }
});
