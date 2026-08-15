let initialized = false;

export async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding DB is unavailable");
  return env.DB;
}

export async function ensureDatabaseSchema() {
  if (initialized) return;
  const db = await getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_user_id ON admins (user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      excerpt TEXT DEFAULT '' NOT NULL,
      content TEXT DEFAULT '' NOT NULL,
      category TEXT DEFAULT '日常' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_slug ON posts (slug)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_posts_status_published_at ON posts (status, published_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_login_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_login_codes_email_created_at ON admin_login_codes (email, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      token_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON admin_sessions (token_hash)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at)"),
  ]);
  await db.prepare("PRAGMA optimize").run();
  initialized = true;
}
