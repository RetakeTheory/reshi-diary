import { DatabaseSync } from "node:sqlite";

// Run the actual prepared SQL against SQLite while emulating D1's async batch interface.
export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return {
    sqlite,
    prepare(sql) {
      const params = [];
      const execute = () => { const statement = sqlite.prepare(sql); const results = statement.all(...params); return { results, meta: { changes: Number(sqlite.prepare("SELECT changes() AS count").get().count) }, success: true }; };
      return { bind(...values) { params.push(...values); return this; }, async all() { return execute(); }, async first() { return execute().results[0] ?? null; }, async run() { return execute(); } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
