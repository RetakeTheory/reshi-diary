use std::{
    net::SocketAddr,
    path::{Path as FsPath, PathBuf},
    str::FromStr,
    sync::LazyLock,
    time::{SystemTime, UNIX_EPOCH},
};

use ammonia::Builder as HtmlSanitizer;
use anyhow::Context;
use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    FromRow, SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use thiserror::Error;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use uuid::Uuid;

const SESSION_COOKIE: &str = "reshi_admin_session";
const CODE_TTL_MS: i64 = 10 * 60 * 1_000;
const SESSION_TTL_MS: i64 = 30 * 24 * 60 * 60 * 1_000;
const SEND_COOLDOWN_MS: i64 = 60 * 1_000;
const MAX_UPLOAD_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    config: Config,
    http: reqwest::Client,
}

#[derive(Clone)]
struct Config {
    listen_addr: SocketAddr,
    database_url: String,
    upload_dir: PathBuf,
    public_origin: String,
    admin_email: String,
    session_secure: bool,
    resend_api_key: Option<String>,
    resend_from_email: String,
}

impl Config {
    fn from_env() -> anyhow::Result<Self> {
        let listen_addr = std::env::var("LISTEN_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8788".into())
            .parse()
            .context("invalid LISTEN_ADDR")?;
        Ok(Self {
            listen_addr,
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite://data/reshi-diary.db".into()),
            upload_dir: std::env::var("UPLOAD_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("data/uploads")),
            public_origin: std::env::var("PUBLIC_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:3000".into())
                .trim_end_matches('/')
                .to_owned(),
            admin_email: std::env::var("ADMIN_EMAIL")
                .unwrap_or_else(|_| "reshi1417@163.com".into())
                .to_lowercase(),
            session_secure: std::env::var("SESSION_SECURE")
                .map(|value| value != "false" && value != "0")
                .unwrap_or(true),
            resend_api_key: std::env::var("RESEND_API_KEY")
                .ok()
                .filter(|value| !value.is_empty()),
            resend_from_email: std::env::var("RESEND_FROM_EMAIL")
                .unwrap_or_else(|_| "reshi diary <noreply@example.com>".into()),
        })
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "reshi_diary_backend=info,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env()?;
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    if let Some(parent) = sqlite_file_parent(&config.database_url) {
        tokio::fs::create_dir_all(parent).await?;
    }
    let options = SqliteConnectOptions::from_str(&config.database_url)?.create_if_missing(true);
    let db = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await?;
    sqlx::migrate!().run(&db).await?;

    let listen_addr = config.listen_addr;
    let state = AppState {
        db,
        config,
        http: reqwest::Client::new(),
    };
    let listener = tokio::net::TcpListener::bind(listen_addr).await?;
    info!(%listen_addr, "reshi diary backend listening");
    axum::serve(listener, routes(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn routes(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/api/posts", get(list_public_posts))
        .route("/api/posts/{slug}", get(get_public_post))
        .route("/api/admin/me", get(admin_me))
        .route("/api/admin/posts", get(list_admin_posts).post(create_post))
        .route(
            "/api/admin/posts/{id}",
            post(method_not_allowed)
                .put(update_post)
                .delete(delete_post),
        )
        .route("/api/admin/auth/send-code", post(send_code))
        .route("/api/admin/auth/verify-code", post(verify_code))
        .route("/api/admin/auth/logout", post(logout))
        .route("/api/admin/uploads", post(upload_file))
        .route("/api/files/{*key}", get(download_file))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES + 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "service": "reshi-diary-backend"
    }))
}

async fn method_not_allowed() -> StatusCode {
    StatusCode::METHOD_NOT_ALLOWED
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct PostRecord {
    id: i64,
    title: String,
    slug: String,
    excerpt: String,
    content: String,
    category: String,
    status: String,
    created_at: i64,
    updated_at: i64,
    published_at: Option<i64>,
}

#[derive(Deserialize)]
struct PublicPostQuery {
    limit: Option<i64>,
}

async fn list_public_posts(
    State(state): State<AppState>,
    Query(query): Query<PublicPostQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let posts = sqlx::query_as::<_, PostRecord>(
        "SELECT id, title, slug, excerpt, content, category, status, created_at, updated_at, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "posts": posts })))
}

async fn get_public_post(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let post = sqlx::query_as::<_, PostRecord>(
        "SELECT id, title, slug, excerpt, content, category, status, created_at, updated_at, published_at FROM posts WHERE slug = ? AND status = 'published' LIMIT 1",
    )
    .bind(slug)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("文章不存在"))?;
    Ok(Json(serde_json::json!({ "post": post })))
}

async fn admin_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    Ok(Json(serde_json::json!({
        "admin": { "email": state.config.admin_email, "displayName": "reshi" }
    })))
}

async fn list_admin_posts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let posts = sqlx::query_as::<_, PostRecord>(
        "SELECT id, title, slug, excerpt, content, category, status, created_at, updated_at, published_at FROM posts ORDER BY updated_at DESC, id DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "posts": posts })))
}

#[derive(Deserialize)]
struct PostInput {
    title: Option<String>,
    excerpt: Option<String>,
    content: Option<String>,
    category: Option<String>,
    status: Option<String>,
}

async fn create_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PostInput>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    require_admin(&state, &headers).await?;
    let post = normalized_post(input)?;
    let now = now_ms();
    let slug = Uuid::new_v4().simple().to_string()[..12].to_owned();
    let published_at = (post.status == "published").then_some(now);
    let result = sqlx::query(
        "INSERT INTO posts (title, slug, excerpt, content, category, status, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(post.title)
    .bind(&slug)
    .bind(post.excerpt)
    .bind(post.content)
    .bind(post.category)
    .bind(post.status)
    .bind(now)
    .bind(now)
    .bind(published_at)
    .execute(&state.db)
    .await?;
    let row = fetch_post(&state.db, result.last_insert_rowid()).await?;
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "post": row })),
    ))
}

async fn update_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<PostInput>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let current = fetch_post(&state.db, id).await?;
    let post = normalized_post(input)?;
    let now = now_ms();
    let published_at = if post.status == "published" {
        current.published_at.or(Some(now))
    } else {
        None
    };
    sqlx::query("UPDATE posts SET title = ?, excerpt = ?, content = ?, category = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?")
        .bind(post.title)
        .bind(post.excerpt)
        .bind(post.content)
        .bind(post.category)
        .bind(post.status)
        .bind(now)
        .bind(published_at)
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(
        serde_json::json!({ "post": fetch_post(&state.db, id).await? }),
    ))
}

async fn delete_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let result = sqlx::query("DELETE FROM posts WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("文章不存在"));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn fetch_post(db: &SqlitePool, id: i64) -> Result<PostRecord, AppError> {
    sqlx::query_as::<_, PostRecord>(
        "SELECT id, title, slug, excerpt, content, category, status, created_at, updated_at, published_at FROM posts WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound("文章不存在"))
}

struct NormalizedPost {
    title: String,
    excerpt: String,
    content: String,
    category: String,
    status: String,
}

fn normalized_post(input: PostInput) -> Result<NormalizedPost, AppError> {
    let title = input.title.unwrap_or_default().trim().to_owned();
    let raw_content = input.content.unwrap_or_default();
    let content = HtmlSanitizer::default().clean(&raw_content).to_string();
    let plain = html_to_plain_text(&content);
    if title.is_empty() {
        return Err(AppError::BadRequest("请填写文章标题".into()));
    }
    if plain.is_empty() && !content.contains("<img") && !content.contains("<div") {
        return Err(AppError::BadRequest("请填写文章正文".into()));
    }
    let excerpt = input.excerpt.unwrap_or_default().trim().to_owned();
    let excerpt = if excerpt.is_empty() {
        plain.chars().take(90).collect()
    } else {
        excerpt
    };
    let category = input.category.unwrap_or_default().trim().to_owned();
    Ok(NormalizedPost {
        title,
        excerpt,
        content,
        category: if category.is_empty() {
            "日常".into()
        } else {
            category
        },
        status: if input.status.as_deref() == Some("published") {
            "published".into()
        } else {
            "draft".into()
        },
    })
}

fn html_to_plain_text(html: &str) -> String {
    static TAG: LazyLock<regex_lite::Regex> =
        LazyLock::new(|| regex_lite::Regex::new(r"<[^>]+>").expect("valid tag regex"));
    html_escape::decode_html_entities(TAG.replace_all(html, " ").as_ref())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Deserialize)]
struct EmailInput {
    email: Option<String>,
}

async fn send_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<EmailInput>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let email = input.email.unwrap_or_default().trim().to_lowercase();
    if email != state.config.admin_email {
        return Err(AppError::BadRequest("管理员邮箱不正确".into()));
    }
    let now = now_ms();
    let recent: Option<i64> = sqlx::query_scalar(
        "SELECT created_at FROM admin_login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;
    if let Some(created_at) = recent {
        if now - created_at < SEND_COOLDOWN_MS {
            return Err(AppError::RateLimited(
                ((SEND_COOLDOWN_MS - (now - created_at)) / 1_000) + 1,
            ));
        }
    }
    let code = format!("{:06}", rand::random::<u32>() % 1_000_000);
    let salt = Uuid::new_v4().simple().to_string();
    let code_hash = hash_value(&format!("{email}:{code}:{salt}"));
    sqlx::query("DELETE FROM admin_login_codes WHERE expires_at < ? OR used_at IS NOT NULL")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO admin_login_codes (email, code_hash, salt, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)")
        .bind(&email)
        .bind(&code_hash)
        .bind(&salt)
        .bind(now + CODE_TTL_MS)
        .bind(now)
        .execute(&state.db)
        .await?;
    if let Err(err) = deliver_code(&state, &code).await {
        sqlx::query("DELETE FROM admin_login_codes WHERE code_hash = ?")
            .bind(code_hash)
            .execute(&state.db)
            .await?;
        return Err(err);
    }
    Ok(Json(
        serde_json::json!({ "ok": true, "expiresIn": CODE_TTL_MS / 1_000 }),
    ))
}

async fn deliver_code(state: &AppState, code: &str) -> Result<(), AppError> {
    let Some(api_key) = &state.config.resend_api_key else {
        if cfg!(debug_assertions) {
            info!(login_code = code, "RESEND_API_KEY absent; local login code");
            return Ok(());
        }
        return Err(AppError::Unavailable("邮件服务尚未配置"));
    };
    let response = state
        .http
        .post("https://api.resend.com/emails")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "from": state.config.resend_from_email,
            "to": [state.config.admin_email.clone()],
            "subject": "reshi 日记本登录验证码",
            "html": format!("<p>登录验证码：</p><p style=\"font-size:32px;font-weight:700\">{code}</p><p>10 分钟内有效。</p>")
        }))
        .send()
        .await
        .map_err(|err| {
            error!(%err, "resend request failed");
            AppError::Upstream("邮件暂时发送失败")
        })?;
    if !response.status().is_success() {
        error!(status = %response.status(), "resend rejected email");
        return Err(AppError::Upstream("邮件暂时发送失败"));
    }
    Ok(())
}

#[derive(Deserialize)]
struct VerifyCodeInput {
    email: Option<String>,
    code: Option<String>,
}

#[derive(FromRow)]
struct LoginCode {
    id: i64,
    code_hash: String,
    salt: String,
    attempts: i64,
    expires_at: i64,
}

async fn verify_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<VerifyCodeInput>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let email = input.email.unwrap_or_default().trim().to_lowercase();
    let code = input.code.unwrap_or_default().trim().to_owned();
    if email != state.config.admin_email
        || code.len() != 6
        || !code.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(AppError::BadRequest("请输入 6 位验证码".into()));
    }
    let row = sqlx::query_as::<_, LoginCode>(
        "SELECT id, code_hash, salt, attempts, expires_at FROM admin_login_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("验证码已过期，请重新发送".into()))?;
    let now = now_ms();
    if row.expires_at <= now {
        return Err(AppError::BadRequest("验证码已过期，请重新发送".into()));
    }
    if row.attempts >= 5 {
        return Err(AppError::RateLimited(60));
    }
    if hash_value(&format!("{}:{}:{}", email, code, row.salt)) != row.code_hash {
        sqlx::query("UPDATE admin_login_codes SET attempts = attempts + 1 WHERE id = ?")
            .bind(row.id)
            .execute(&state.db)
            .await?;
        return Err(AppError::BadRequest("验证码不正确".into()));
    }
    sqlx::query("UPDATE admin_login_codes SET used_at = ? WHERE id = ?")
        .bind(now)
        .bind(row.id)
        .execute(&state.db)
        .await?;
    let cookie = issue_session(&state).await?;
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response())
}

async fn issue_session(state: &AppState) -> Result<HeaderValue, AppError> {
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let now = now_ms();
    sqlx::query("DELETE FROM admin_sessions WHERE expires_at <= ?")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(hash_value(&token))
        .bind(&state.config.admin_email)
        .bind(now)
        .bind(now + SESSION_TTL_MS)
        .execute(&state.db)
        .await?;
    let secure = if state.config.session_secure {
        "; Secure"
    } else {
        ""
    };
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age={}",
        SESSION_TTL_MS / 1_000
    ))
    .map_err(|_| AppError::Internal)
}

async fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let token = cookie_value(headers, SESSION_COOKIE).ok_or(AppError::Unauthorized)?;
    let expires_at: Option<i64> = sqlx::query_scalar(
        "SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND email = ? LIMIT 1",
    )
    .bind(hash_value(token))
    .bind(&state.config.admin_email)
    .fetch_optional(&state.db)
    .await?;
    if expires_at.is_some_and(|value| value > now_ms()) {
        Ok(())
    } else {
        Err(AppError::Unauthorized)
    }
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    if let Some(token) = cookie_value(&headers, SESSION_COOKIE) {
        sqlx::query("DELETE FROM admin_sessions WHERE token_hash = ?")
            .bind(hash_value(token))
            .execute(&state.db)
            .await?;
    }
    let secure = if state.config.session_secure {
        "; Secure"
    } else {
        ""
    };
    let cookie = HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}=; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age=0"
    ))
    .map_err(|_| AppError::Internal)?;
    Ok((
        StatusCode::SEE_OTHER,
        [
            (header::LOCATION, HeaderValue::from_static("/admin/login")),
            (header::SET_COOKIE, cookie),
        ],
    )
        .into_response())
}

async fn upload_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    require_admin(&state, &headers).await?;
    let mut previewable = false;
    let mut upload: Option<(String, String, Vec<u8>)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::BadRequest("上传表单无效".into()))?
    {
        match field.name() {
            Some("previewable") => {
                previewable = field.text().await.unwrap_or_default() == "true";
            }
            Some("file") => {
                let filename = safe_filename(field.file_name().unwrap_or("attachment"));
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_owned();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| AppError::BadRequest("无法读取文件".into()))?;
                if bytes.len() > MAX_UPLOAD_BYTES {
                    return Err(AppError::PayloadTooLarge);
                }
                upload = Some((filename, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }
    let (filename, original_type, bytes) =
        upload.ok_or_else(|| AppError::BadRequest("请选择要上传的文件".into()))?;
    let content_type = stored_content_type(&original_type, &filename, previewable);
    let object_id = Uuid::new_v4().simple().to_string();
    let key = format!("uploads/{object_id}");
    let disk_path = state.config.upload_dir.join(&object_id);
    tokio::fs::write(&disk_path, &bytes).await?;
    sqlx::query("INSERT INTO uploads (key, filename, content_type, size, previewable, disk_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&key)
        .bind(&filename)
        .bind(&content_type)
        .bind(bytes.len() as i64)
        .bind(if previewable { 1_i64 } else { 0_i64 })
        .bind(disk_path.to_string_lossy().as_ref())
        .bind(now_ms())
        .execute(&state.db)
        .await?;
    let url = format!("/api/files/{key}");
    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "name": filename,
            "url": url,
            "downloadUrl": format!("{url}?download=1"),
            "type": content_type,
            "size": bytes.len(),
            "previewable": previewable,
            "isImage": original_type.starts_with("image/")
        })),
    ))
}

#[derive(Deserialize)]
struct DownloadQuery {
    download: Option<u8>,
}

#[derive(FromRow)]
struct UploadRecord {
    filename: String,
    content_type: String,
    size: i64,
    previewable: i64,
    disk_path: String,
}

async fn download_file(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, AppError> {
    let row = sqlx::query_as::<_, UploadRecord>(
        "SELECT filename, content_type, size, previewable, disk_path FROM uploads WHERE key = ? LIMIT 1",
    )
    .bind(&key)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("文件不存在"))?;
    let bytes = tokio::fs::read(&row.disk_path).await.map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            AppError::NotFound("文件不存在")
        } else {
            AppError::Io(err)
        }
    })?;
    let inline = row.previewable == 1 && query.download != Some(1);
    let disposition = content_disposition(&row.filename, inline);
    let mut response = Response::new(Body::from(bytes));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&row.content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).map_err(|_| AppError::Internal)?,
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&row.size.to_string()).map_err(|_| AppError::Internal)?,
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=3600"),
    );
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
}

fn content_disposition(filename: &str, inline: bool) -> String {
    let ascii: String = filename
        .chars()
        .map(|character| {
            if character.is_ascii_graphic() && character != '"' && character != '\\' {
                character
            } else {
                '_'
            }
        })
        .collect();
    format!(
        "{}; filename=\"{}\"; filename*=UTF-8''{}",
        if inline { "inline" } else { "attachment" },
        ascii,
        urlencoding::encode(filename)
    )
}

fn safe_filename(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| {
            if character.is_control() || "\\/:*?\"<>|".contains(character) {
                '-'
            } else {
                character
            }
        })
        .take(120)
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        "attachment".into()
    } else {
        cleaned.into()
    }
}

fn stored_content_type(original: &str, filename: &str, previewable: bool) -> String {
    if !previewable {
        return if original.is_empty() {
            "application/octet-stream".into()
        } else {
            original.into()
        };
    }
    match FsPath::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "txt" | "md" => "text/plain; charset=utf-8",
        "pdf" => "application/pdf",
        _ => {
            if original.is_empty() {
                "application/octet-stream"
            } else {
                original
            }
        }
    }
    .into()
}

fn verify_origin(config: &Config, headers: &HeaderMap) -> Result<(), AppError> {
    if let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    {
        if origin.trim_end_matches('/') != config.public_origin {
            return Err(AppError::Forbidden);
        }
    }
    Ok(())
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            (key == name).then_some(value)
        })
}

fn hash_value(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn sqlite_file_parent(url: &str) -> Option<&FsPath> {
    let path = url.strip_prefix("sqlite://")?;
    FsPath::new(path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl+C handler")
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}

#[derive(Debug, Error)]
enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("{0}")]
    NotFound(&'static str),
    #[error("rate limited")]
    RateLimited(i64),
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("{0}")]
    Unavailable(&'static str),
    #[error("{0}")]
    Upstream(&'static str),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("internal error")]
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message, retry_after) = match &self {
            Self::BadRequest(message) => (StatusCode::BAD_REQUEST, message.as_str(), None),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "未登录或没有管理员权限", None),
            Self::Forbidden => (StatusCode::FORBIDDEN, "请求来源无效", None),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, *message, None),
            Self::RateLimited(seconds) => (
                StatusCode::TOO_MANY_REQUESTS,
                "请求过于频繁",
                Some(*seconds),
            ),
            Self::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "单个文件不能超过 20 MB",
                None,
            ),
            Self::Unavailable(message) => (StatusCode::SERVICE_UNAVAILABLE, *message, None),
            Self::Upstream(message) => (StatusCode::BAD_GATEWAY, *message, None),
            Self::Database(err) => {
                error!(%err, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "数据库错误", None)
            }
            Self::Io(err) => {
                error!(%err, "io error");
                (StatusCode::INTERNAL_SERVER_ERROR, "文件存储错误", None)
            }
            Self::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误", None),
        };
        let mut response = (
            status,
            Json(serde_json::json!({
                "error": message,
                "retryAfter": retry_after
            })),
        )
            .into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if let Some(seconds) = retry_after {
            if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
                response.headers_mut().insert(header::RETRY_AFTER, value);
            }
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_removes_unsafe_chars() {
        assert_eq!(safe_filename("a/../b?.txt"), "a-..-b-.txt");
    }

    #[test]
    fn plain_text_removes_tags_and_decodes_entities() {
        assert_eq!(html_to_plain_text("<p>A &amp; B</p><p>C</p>"), "A & B C");
    }
}

