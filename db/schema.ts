import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const admins = sqliteTable(
  "admins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_admins_user_id").on(table.userId)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    content: text("content").notNull().default(""),
    category: text("category").notNull().default("日常"),
    status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("idx_posts_slug").on(table.slug),
    index("idx_posts_status_published_at").on(table.status, table.publishedAt),
  ],
);

export const adminLoginCodes = sqliteTable(
  "admin_login_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    salt: text("salt").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_admin_login_codes_email_created_at").on(table.email, table.createdAt)],
);

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull(),
    email: text("email").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_admin_sessions_token_hash").on(table.tokenHash),
    index("idx_admin_sessions_expires_at").on(table.expiresAt),
  ],
);

export const adminPasskeys = sqliteTable(
  "admin_passkeys",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    webauthnUserId: text("webauthn_user_id").notNull(),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    transports: text("transports").notNull().default("[]"),
    name: text("name").notNull().default("Passkey"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_admin_passkeys_email").on(table.email)],
);

export const adminPasskeyChallenges = sqliteTable(
  "admin_passkey_challenges",
  {
    flowId: text("flow_id").primaryKey(),
    purpose: text("purpose", { enum: ["registration", "authentication"] }).notNull(),
    challenge: text("challenge").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_admin_passkey_challenges_expires_at").on(table.expiresAt)],
);

export const uploads = sqliteTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    previewable: integer("previewable", { mode: "boolean" }).notNull().default(false),
    data: blob("data", { mode: "buffer" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_uploads_created_at").on(table.createdAt)],
);

export const surveys = sqliteTable(
  "surveys",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("draft"),
    access: text("access", { enum: ["public", "registered"] }).notNull().default("public"),
    kind: text("kind", { enum: ["standard", "exam", "information_query"] }).notNull().default("standard"),
    queryEnabled: integer("query_enabled", { mode: "boolean" }).notNull().default(false),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    examInstructions: text("exam_instructions").notNull().default(""),
    examStartAt: integer("exam_start_at").notNull().default(0),
    queryIdentityQuestionId: text("query_identity_question_id").notNull().default(""),
    ipLimit: integer("ip_limit").notNull().default(1),
    submitLabel: text("submit_label").notNull().default("提交答卷"),
    successMode: text("success_mode", { enum: ["message", "redirect"] }).notNull().default("message"),
    successContent: text("success_content").notNull().default("<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>"),
    successRedirectUrl: text("success_redirect_url").notNull().default(""),
    questionsJson: text("questions_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_surveys_slug").on(table.slug), index("idx_surveys_status_updated_at").on(table.status, table.updatedAt)],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    uid: text("uid").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key").notNull(),
    avatarKey: text("avatar_key"),
    passwordHash: text("password_hash"),
    points: integer("points").notNull().default(0),
    isBanned: integer("is_banned", { mode: "boolean" }).notNull().default(false),
    banReason: text("ban_reason"),
    bannedAt: integer("banned_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_users_uid").on(table.uid), uniqueIndex("idx_users_email").on(table.email), uniqueIndex("idx_users_display_name_key").on(table.displayNameKey)],
);

export const surveyResponses = sqliteTable(
  "survey_responses",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    userId: text("user_id"),
    lookupHash: text("lookup_hash"),
    answersJson: text("answers_json").notNull(),
    score: integer("score"),
    maxScore: integer("max_score"),
    feedbackJson: text("feedback_json").notNull().default('{"status":"pending","title":"","modules":[],"includeReport":false,"updatedAt":null}'),
    feedbackUpdatedAt: integer("feedback_updated_at", { mode: "timestamp_ms" }),
    feedbackGroup: text("feedback_group"),
    attemptId: text("attempt_id"),
    manualScoresJson: text("manual_scores_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_survey_responses_survey_created_at").on(table.surveyId, table.createdAt), index("idx_survey_responses_ip").on(table.surveyId, table.ipHash), index("idx_survey_responses_feedback_group").on(table.surveyId, table.feedbackGroup), uniqueIndex("idx_survey_responses_attempt").on(table.attemptId)],
);

export const surveyAttempts = sqliteTable(
  "survey_attempts",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id").notNull(),
    actorKey: text("actor_key").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_survey_attempts_actor").on(table.surveyId, table.actorKey, table.expiresAt)],
);

export const surveyQueryAttempts = sqliteTable(
  "survey_query_attempts",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    lookupHash: text("lookup_hash").notNull(),
    success: integer("success", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_survey_query_attempts_ip").on(table.surveyId, table.ipHash, table.createdAt), index("idx_survey_query_attempts_lookup").on(table.surveyId, table.lookupHash, table.success, table.createdAt)],
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
