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

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
