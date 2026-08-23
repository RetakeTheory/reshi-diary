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
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_passkeys (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      webauthn_user_id TEXT NOT NULL,
      public_key BLOB NOT NULL,
      counter INTEGER DEFAULT 0 NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER DEFAULT 0 NOT NULL,
      transports TEXT DEFAULT '[]' NOT NULL,
      name TEXT DEFAULT 'Passkey' NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_passkeys_email ON admin_passkeys (email)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_passkey_challenges (
      flow_id TEXT PRIMARY KEY NOT NULL,
      purpose TEXT NOT NULL,
      challenge TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_admin_passkey_challenges_expires_at ON admin_passkey_challenges (expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_key TEXT,
      points INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reader_login_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      email TEXT NOT NULL,
      intent TEXT NOT NULL,
      display_name TEXT,
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reader_login_codes_email_created_at ON reader_login_codes (email, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reader_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reader_sessions_expires_at ON reader_sessions (expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reader_passkeys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      public_key BLOB NOT NULL,
      counter INTEGER DEFAULT 0 NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER DEFAULT 0 NOT NULL,
      transports TEXT DEFAULT '[]' NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_reader_passkeys_user ON reader_passkeys (user_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reader_passkey_challenges (
      flow_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      challenge TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      parent_id INTEGER,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_comments_post_created_at ON comments (post_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS post_reactions (
      post_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id, kind)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS point_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      task TEXT NOT NULL,
      day_key INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (user_id, task, day_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      admin_reply TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_user_updated_at ON tickets (user_id, updated_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      text TEXT NOT NULL,
      background_color TEXT NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      access TEXT DEFAULT 'public' NOT NULL,
      ip_limit INTEGER DEFAULT 1 NOT NULL,
      submit_label TEXT DEFAULT '提交答卷' NOT NULL,
      success_mode TEXT DEFAULT 'message' NOT NULL,
      success_content TEXT DEFAULT '<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>' NOT NULL,
      success_redirect_url TEXT DEFAULT '' NOT NULL,
      questions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_surveys_status_updated_at ON surveys (status, updated_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS survey_responses (
      id TEXT PRIMARY KEY NOT NULL,
      survey_id TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_created_at ON survey_responses (survey_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_ip ON survey_responses (survey_id, ip_hash)"),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS enforce_survey_ip_limit
      BEFORE INSERT ON survey_responses
      WHEN (SELECT COUNT(*) FROM survey_responses WHERE survey_id = NEW.survey_id AND ip_hash = NEW.ip_hash)
        >= (SELECT ip_limit FROM surveys WHERE id = NEW.survey_id)
      BEGIN SELECT RAISE(ABORT, 'survey_ip_limit'); END`),
    db.prepare(`CREATE TABLE IF NOT EXISTS uploads (
      key TEXT PRIMARY KEY NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      previewable INTEGER DEFAULT 0 NOT NULL,
      data BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )`),
  ]);
  const userColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const names = new Set((userColumns.results || []).map((column) => column.name));
  if (!names.has("avatar_key")) await db.prepare("ALTER TABLE users ADD COLUMN avatar_key TEXT").run();
  if (!names.has("points")) await db.prepare("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0 NOT NULL").run();
  if (!names.has("updated_at")) await db.prepare("ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT 0 NOT NULL").run();
  const surveyColumns = await db.prepare("PRAGMA table_info(surveys)").all<{ name: string }>();
  const surveyNames = new Set((surveyColumns.results || []).map((column) => column.name));
  if (!surveyNames.has("access")) await db.prepare("ALTER TABLE surveys ADD COLUMN access TEXT DEFAULT 'public' NOT NULL").run();
  if (!surveyNames.has("submit_label")) await db.prepare("ALTER TABLE surveys ADD COLUMN submit_label TEXT DEFAULT '提交答卷' NOT NULL").run();
  if (!surveyNames.has("success_mode")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_mode TEXT DEFAULT 'message' NOT NULL").run();
  if (!surveyNames.has("success_content")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_content TEXT DEFAULT '<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>' NOT NULL").run();
  if (!surveyNames.has("success_redirect_url")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_redirect_url TEXT DEFAULT '' NOT NULL").run();
  await db.prepare("PRAGMA optimize").run();
  initialized = true;
}
