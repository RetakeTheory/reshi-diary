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
    db.prepare(`CREATE TABLE IF NOT EXISTS reader_password_attempts (
      key_hash TEXT PRIMARY KEY NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      window_started_at INTEGER NOT NULL
    )`),
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
    db.prepare(`CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      ticket_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created_at ON ticket_messages (ticket_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      text TEXT NOT NULL,
      background_color TEXT NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS onebot_bots (
      bot_id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      groups_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS qq_bindings (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      qq_id TEXT NOT NULL UNIQUE,
      bot_id TEXT NOT NULL,
      bound_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS qq_auth_challenges (
      flow_id TEXT PRIMARY KEY NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'bind')),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      request_key_hash TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      verified_qq_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'consumed')),
      error TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      verified_at INTEGER,
      consumed_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_qq_auth_challenges_request_created ON qq_auth_challenges (request_key_hash, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_qq_auth_challenges_expiry ON qq_auth_challenges (expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS onebot_delivery_daily (
      day_key INTEGER NOT NULL,
      admin_email TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      last_message_id TEXT,
      last_status TEXT NOT NULL,
      last_sent_at INTEGER NOT NULL,
      PRIMARY KEY (day_key, bot_id, group_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS onebot_scheduled_messages (
      id TEXT PRIMARY KEY NOT NULL,
      bot_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('private', 'group')),
      target_id TEXT NOT NULL,
      delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('text', 'image', 'card-image')),
      summary TEXT NOT NULL,
      message_text TEXT DEFAULT '' NOT NULL,
      image_key TEXT,
      admin_email TEXT,
      mention_user_id TEXT,
      due_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      claimed_at INTEGER,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onebot_scheduled_due ON onebot_scheduled_messages (due_at, claimed_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_onebot_scheduled_bot_due ON onebot_scheduled_messages (bot_id, due_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '' NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      access TEXT DEFAULT 'public' NOT NULL,
      kind TEXT DEFAULT 'standard' NOT NULL,
      query_enabled INTEGER DEFAULT 0 NOT NULL,
      duration_minutes INTEGER DEFAULT 0 NOT NULL,
      exam_instructions TEXT DEFAULT '' NOT NULL,
      exam_start_at INTEGER DEFAULT 0 NOT NULL,
      query_identity_question_id TEXT DEFAULT '' NOT NULL,
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
      user_id TEXT,
      lookup_hash TEXT,
      answers_json TEXT NOT NULL,
      score INTEGER,
      max_score INTEGER,
      feedback_json TEXT DEFAULT '{"status":"pending","title":"","modules":[],"includeReport":false,"updatedAt":null}' NOT NULL,
      feedback_updated_at INTEGER,
      feedback_group TEXT,
      attempt_id TEXT,
      manual_scores_json TEXT DEFAULT '{}' NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_created_at ON survey_responses (survey_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_ip ON survey_responses (survey_id, ip_hash)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS survey_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      survey_id TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      submitted_at INTEGER,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_attempts_actor ON survey_attempts (survey_id, actor_key, expires_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS survey_query_attempts (
      id TEXT PRIMARY KEY NOT NULL,
      survey_id TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      lookup_hash TEXT NOT NULL,
      success INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_query_attempts_ip ON survey_query_attempts (survey_id, ip_hash, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_query_attempts_lookup ON survey_query_attempts (survey_id, lookup_hash, success, created_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS food_rankings (
      id TEXT PRIMARY KEY NOT NULL,
      list_type TEXT NOT NULL,
      restaurant TEXT NOT NULL,
      location TEXT DEFAULT '' NOT NULL,
      category TEXT DEFAULT '' NOT NULL,
      summary TEXT NOT NULL,
      details TEXT DEFAULT '' NOT NULL,
      tags_json TEXT DEFAULT '[]' NOT NULL,
      image_url TEXT DEFAULT '' NOT NULL,
      latitude REAL,
      longitude REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_food_rankings_type_updated ON food_rankings (list_type, updated_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS food_ranking_votes (
      entry_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (entry_id, user_id),
      FOREIGN KEY (entry_id) REFERENCES food_rankings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_food_ranking_votes_entry ON food_ranking_votes (entry_id, vote)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS food_ratings (
      entry_id TEXT NOT NULL REFERENCES food_rankings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (entry_id, user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS survey_file_uploads (
      key TEXT PRIMARY KEY NOT NULL,
      survey_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      response_id TEXT,
      FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_file_uploads_survey_created ON survey_file_uploads (survey_id, created_at DESC)"),
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
  if (!names.has("uid")) await db.prepare("ALTER TABLE users ADD COLUMN uid TEXT").run();
  if (!names.has("display_name_key")) await db.prepare("ALTER TABLE users ADD COLUMN display_name_key TEXT").run();
  if (!names.has("password_hash")) await db.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run();
  if (!names.has("is_banned")) await db.prepare("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0 NOT NULL").run();
  if (!names.has("ban_reason")) await db.prepare("ALTER TABLE users ADD COLUMN ban_reason TEXT").run();
  if (!names.has("banned_at")) await db.prepare("ALTER TABLE users ADD COLUMN banned_at INTEGER").run();
  const existingUsers = await db.prepare("SELECT id, uid, display_name, display_name_key FROM users ORDER BY created_at ASC").all<{ id: string; uid: string | null; display_name: string; display_name_key: string | null }>();
  const usedUids = new Set((existingUsers.results || []).map((user) => user.uid).filter(Boolean) as string[]);
  const usedNames = new Set<string>();
  const userUpdates = [];
  for (const user of existingUsers.results || []) {
    let userUid = user.uid;
    while (!userUid || usedUids.has(userUid) && userUid !== user.uid) userUid = String(crypto.getRandomValues(new Uint32Array(1))[0] % 90_000_000 + 10_000_000);
    usedUids.add(userUid);
    let displayName = user.display_name.trim() || `用户${userUid.slice(-4)}`;
    let displayNameKey = displayName.normalize("NFKC").toLocaleLowerCase("zh-CN");
    if (usedNames.has(displayNameKey)) { displayName = `${displayName.slice(0, 34)}-${userUid.slice(-4)}`; displayNameKey = displayName.normalize("NFKC").toLocaleLowerCase("zh-CN"); }
    usedNames.add(displayNameKey);
    if (user.uid !== userUid || user.display_name !== displayName || user.display_name_key !== displayNameKey) userUpdates.push(db.prepare("UPDATE users SET uid = ?, display_name = ?, display_name_key = ? WHERE id = ?").bind(userUid, displayName, displayNameKey, user.id));
  }
  if (userUpdates.length) await db.batch(userUpdates);
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid ON users (uid)").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_key ON users (display_name_key)").run();
  const oneBotColumns = await db.prepare("PRAGMA table_info(onebot_bots)").all<{ name: string }>();
  if (!(oneBotColumns.results || []).some((column) => column.name === "groups_json")) {
    await db.prepare("ALTER TABLE onebot_bots ADD COLUMN groups_json TEXT NOT NULL DEFAULT '[]'").run();
  }
  const scheduledOneBotColumns = await db.prepare("PRAGMA table_info(onebot_scheduled_messages)").all<{ name: string }>();
  if (!(scheduledOneBotColumns.results || []).some((column) => column.name === "mention_user_id")) {
    await db.prepare("ALTER TABLE onebot_scheduled_messages ADD COLUMN mention_user_id TEXT").run();
  }
  await db.prepare(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, created_at)
    SELECT id, 'user', user_id, body, created_at FROM tickets
    WHERE NOT EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = tickets.id)`).run();
  await db.prepare(`INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, created_at)
    SELECT id, 'admin', NULL, admin_reply, updated_at FROM tickets
    WHERE admin_reply IS NOT NULL AND admin_reply <> '' AND NOT EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = tickets.id AND m.sender_type = 'admin')`).run();
  const surveyColumns = await db.prepare("PRAGMA table_info(surveys)").all<{ name: string }>();
  const surveyNames = new Set((surveyColumns.results || []).map((column) => column.name));
  if (!surveyNames.has("access")) await db.prepare("ALTER TABLE surveys ADD COLUMN access TEXT DEFAULT 'public' NOT NULL").run();
  if (!surveyNames.has("submit_label")) await db.prepare("ALTER TABLE surveys ADD COLUMN submit_label TEXT DEFAULT '提交答卷' NOT NULL").run();
  if (!surveyNames.has("success_mode")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_mode TEXT DEFAULT 'message' NOT NULL").run();
  if (!surveyNames.has("success_content")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_content TEXT DEFAULT '<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>' NOT NULL").run();
  if (!surveyNames.has("success_redirect_url")) await db.prepare("ALTER TABLE surveys ADD COLUMN success_redirect_url TEXT DEFAULT '' NOT NULL").run();
  if (!surveyNames.has("kind")) await db.prepare("ALTER TABLE surveys ADD COLUMN kind TEXT DEFAULT 'standard' NOT NULL").run();
  if (!surveyNames.has("query_enabled")) await db.prepare("ALTER TABLE surveys ADD COLUMN query_enabled INTEGER DEFAULT 0 NOT NULL").run();
  await db.prepare("UPDATE surveys SET query_enabled = 1, kind = 'standard' WHERE kind = 'information_query'").run();
  if (!surveyNames.has("duration_minutes")) await db.prepare("ALTER TABLE surveys ADD COLUMN duration_minutes INTEGER DEFAULT 0 NOT NULL").run();
  if (!surveyNames.has("exam_instructions")) await db.prepare("ALTER TABLE surveys ADD COLUMN exam_instructions TEXT DEFAULT '' NOT NULL").run();
  if (!surveyNames.has("exam_start_at")) await db.prepare("ALTER TABLE surveys ADD COLUMN exam_start_at INTEGER DEFAULT 0 NOT NULL").run();
  if (!surveyNames.has("query_identity_question_id")) await db.prepare("ALTER TABLE surveys ADD COLUMN query_identity_question_id TEXT DEFAULT '' NOT NULL").run();
  const surveyResponseColumns = await db.prepare("PRAGMA table_info(survey_responses)").all<{ name: string }>();
  const surveyResponseNames = new Set((surveyResponseColumns.results || []).map((column) => column.name));
  if (!surveyResponseNames.has("user_id")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN user_id TEXT").run();
  if (!surveyResponseNames.has("lookup_hash")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN lookup_hash TEXT").run();
  if (!surveyResponseNames.has("score")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN score INTEGER").run();
  if (!surveyResponseNames.has("max_score")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN max_score INTEGER").run();
  if (!surveyResponseNames.has("feedback_json")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN feedback_json TEXT DEFAULT '{\"status\":\"pending\",\"title\":\"\",\"modules\":[],\"includeReport\":false,\"updatedAt\":null}' NOT NULL").run();
  if (!surveyResponseNames.has("feedback_updated_at")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN feedback_updated_at INTEGER").run();
  if (!surveyResponseNames.has("feedback_group")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN feedback_group TEXT").run();
  if (!surveyResponseNames.has("attempt_id")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN attempt_id TEXT").run();
  if (!surveyResponseNames.has("manual_scores_json")) await db.prepare("ALTER TABLE survey_responses ADD COLUMN manual_scores_json TEXT DEFAULT '{}' NOT NULL").run();
  const foodRankingColumns = await db.prepare("PRAGMA table_info(food_rankings)").all<{ name: string }>();
  const foodRankingNames = new Set((foodRankingColumns.results || []).map((item) => item.name));
  if (!foodRankingNames.has("image_url")) await db.prepare("ALTER TABLE food_rankings ADD COLUMN image_url TEXT DEFAULT '' NOT NULL").run();
  if (!foodRankingNames.has("admin_rating")) await db.prepare("ALTER TABLE food_rankings ADD COLUMN admin_rating INTEGER CHECK (admin_rating BETWEEN 1 AND 5)").run();
  if (!foodRankingNames.has("latitude")) await db.prepare("ALTER TABLE food_rankings ADD COLUMN latitude REAL").run();
  if (!foodRankingNames.has("longitude")) await db.prepare("ALTER TABLE food_rankings ADD COLUMN longitude REAL").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_user ON survey_responses (survey_id, user_id, created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_lookup ON survey_responses (survey_id, lookup_hash, created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_survey_responses_feedback_group ON survey_responses (survey_id, feedback_group)").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_attempt ON survey_responses (attempt_id)").run();
  await db.prepare("PRAGMA optimize").run();
  initialized = true;
}

