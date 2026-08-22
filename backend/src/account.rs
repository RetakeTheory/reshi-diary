use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{AppError, AppState, now_ms, require_admin, users, verify_origin};

const AVATAR_MAX_BYTES: usize = 3 * 1024 * 1024;
const LEVEL_COLORS: [&str; 16] = [
    "#64748B", "#2F80ED", "#0EA5A4", "#16A34A", "#65A30D", "#CA8A04", "#EA580C",
    "#E11D48", "#DB2777", "#C026D3", "#9333EA", "#7C3AED", "#4F46E5", "#2563EB",
    "#0891B2", "#B45309",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DailyTask {
    key: &'static str,
    label: &'static str,
    points: i64,
    completed: bool,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct TicketItem {
    id: i64,
    category: String,
    title: String,
    body: String,
    status: String,
    admin_reply: Option<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminTicketItem {
    id: i64,
    category: String,
    title: String,
    body: String,
    status: String,
    admin_reply: Option<String>,
    created_at: i64,
    updated_at: i64,
    display_name: String,
    email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TicketBody {
    category: Option<String>,
    title: Option<String>,
    body: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TicketUpdateBody {
    status: Option<String>,
    admin_reply: Option<String>,
}

pub(crate) async fn upload_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let mut user = users::require_user(&state, &headers).await?;
    let mut upload: Option<(String, Vec<u8>)> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::BadRequest("上传表单无效".into()))?
    {
        if field.name() != Some("avatar") {
            continue;
        }
        let content_type = field.content_type().unwrap_or("").to_owned();
        if !matches!(content_type.as_str(), "image/jpeg" | "image/png" | "image/webp") {
            return Err(AppError::BadRequest("头像仅支持 JPG、PNG 或 WebP".into()));
        }
        let bytes = field
            .bytes()
            .await
            .map_err(|_| AppError::BadRequest("无法读取头像".into()))?;
        if bytes.len() > AVATAR_MAX_BYTES {
            return Err(AppError::PayloadTooLarge);
        }
        upload = Some((content_type, bytes.to_vec()));
    }
    let (content_type, bytes) =
        upload.ok_or_else(|| AppError::BadRequest("请选择头像图片".into()))?;
    let object_id = Uuid::new_v4().simple().to_string();
    let key = format!("avatars/{object_id}");
    let disk_path = state.config.upload_dir.join(&object_id);
    tokio::fs::write(&disk_path, &bytes).await?;
    let now = now_ms();
    sqlx::query("INSERT INTO uploads (key, filename, content_type, size, previewable, disk_path, created_at) VALUES (?, 'avatar.jpg', ?, ?, 1, ?, ?)")
        .bind(&key)
        .bind(&content_type)
        .bind(bytes.len() as i64)
        .bind(disk_path.to_string_lossy().as_ref())
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?")
        .bind(&key)
        .bind(now)
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    user.avatar_key = Some(key.clone());
    user.avatar_url = Some(format!("/api/files/{key}"));
    Ok(Json(serde_json::json!({ "user": user_payload(&user) })))
}

pub(crate) async fn get_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = users::require_user(&state, &headers).await?;
    Ok(Json(serde_json::json!({
        "user": user_payload(&user),
        "tasks": task_state(&state, &user.id).await?,
    })))
}

pub(crate) async fn check_in(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let mut user = users::require_user(&state, &headers).await?;
    let awarded = award_daily_points(&state, &user.id, "check_in", 2).await?;
    if awarded {
        user.points += 2;
    }
    Ok(Json(serde_json::json!({
        "awarded": awarded,
        "user": user_payload(&user),
        "tasks": task_state(&state, &user.id).await?,
    })))
}

pub(crate) async fn award_daily_points(
    state: &AppState,
    user_id: &str,
    task: &str,
    points: i64,
) -> Result<bool, AppError> {
    let now = now_ms();
    let inserted = sqlx::query("INSERT INTO point_events (user_id, task, day_key, points, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, task, day_key) DO NOTHING")
        .bind(user_id)
        .bind(task)
        .bind(day_key(now))
        .bind(points)
        .bind(now)
        .execute(&state.db)
        .await?
        .rows_affected()
        > 0;
    if inserted {
        sqlx::query("UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?")
            .bind(points)
            .bind(now)
            .bind(user_id)
            .execute(&state.db)
            .await?;
    }
    Ok(inserted)
}

pub(crate) async fn list_tickets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = users::require_user(&state, &headers).await?;
    let tickets = sqlx::query_as::<_, TicketItem>("SELECT id, category, title, body, status, admin_reply, created_at, updated_at FROM tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50")
        .bind(&user.id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "tickets": tickets })))
}

pub(crate) async fn create_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<TicketBody>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let user = users::require_user(&state, &headers).await?;
    let category = match input.category.as_deref() {
        Some("problem") => "problem",
        Some("question") => "question",
        _ => "feedback",
    };
    let title = normalize_text(input.title.as_deref(), 80, "请填写 1–80 字的标题")?;
    let body = normalize_text(input.body.as_deref(), 2_000, "请填写 1–2000 字的内容")?;
    let now = now_ms();
    let result = sqlx::query("INSERT INTO tickets (user_id, category, title, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'open', ?, ?)")
        .bind(&user.id)
        .bind(category)
        .bind(&title)
        .bind(&body)
        .bind(now)
        .bind(now)
        .execute(&state.db)
        .await?;
    let ticket = ticket_by_id(&state, result.last_insert_rowid()).await?;
    Ok((StatusCode::CREATED, Json(serde_json::json!({ "ticket": ticket }))))
}

pub(crate) async fn list_admin_tickets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let tickets = sqlx::query_as::<_, AdminTicketItem>("SELECT tickets.id, tickets.category, tickets.title, tickets.body, tickets.status, tickets.admin_reply, tickets.created_at, tickets.updated_at, users.display_name, users.email FROM tickets JOIN users ON users.id = tickets.user_id ORDER BY tickets.updated_at DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "tickets": tickets })))
}

pub(crate) async fn update_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(input): Json<TicketUpdateBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let status = match input.status.as_deref() {
        Some(value @ ("open" | "in_progress" | "resolved" | "closed")) => value,
        _ => return Err(AppError::BadRequest("工单状态无效".into())),
    };
    let reply = input.admin_reply.map(|value| value.trim().chars().take(2_000).collect::<String>()).filter(|value| !value.is_empty());
    let updated = sqlx::query("UPDATE tickets SET status = ?, admin_reply = ?, updated_at = ? WHERE id = ?")
        .bind(status)
        .bind(reply)
        .bind(now_ms())
        .bind(id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if updated == 0 {
        return Err(AppError::NotFound("工单不存在"));
    }
    Ok(Json(serde_json::json!({ "ticket": ticket_by_id(&state, id).await? })))
}

fn user_payload(user: &users::UserRecord) -> serde_json::Value {
    let level = reader_level(user.points);
    serde_json::json!({
        "id": user.id,
        "email": user.email,
        "displayName": user.display_name,
        "avatarUrl": user.avatar_url,
        "points": user.points,
        "level": level,
        "levelColor": LEVEL_COLORS[level as usize - 1],
        "createdAt": user.created_at,
    })
}

fn reader_level(points: i64) -> i64 {
    (points.max(0) / 100 + 1).clamp(1, 16)
}

fn day_key(now: i64) -> i64 {
    (now + 8 * 60 * 60 * 1_000) / 86_400_000
}

async fn task_state(state: &AppState, user_id: &str) -> Result<Vec<DailyTask>, AppError> {
    let completed = sqlx::query_scalar::<_, String>("SELECT task FROM point_events WHERE user_id = ? AND day_key = ?")
        .bind(user_id)
        .bind(day_key(now_ms()))
        .fetch_all(&state.db)
        .await?;
    Ok([("check_in", "每日签到", 2), ("comment", "发表评论", 3), ("reaction", "添加回应", 3)]
        .into_iter()
        .map(|(key, label, points)| DailyTask { key, label, points, completed: completed.iter().any(|value| value == key) })
        .collect())
}

async fn ticket_by_id(state: &AppState, id: i64) -> Result<TicketItem, AppError> {
    sqlx::query_as::<_, TicketItem>("SELECT id, category, title, body, status, admin_reply, created_at, updated_at FROM tickets WHERE id = ? LIMIT 1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("工单不存在"))
}

fn normalize_text(value: Option<&str>, max: usize, message: &str) -> Result<String, AppError> {
    let value = value.unwrap_or_default().trim();
    let count = value.chars().count();
    if count == 0 || count > max {
        return Err(AppError::BadRequest(message.into()));
    }
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_are_capped_at_sixteen() {
        assert_eq!(reader_level(0), 1);
        assert_eq!(reader_level(100), 2);
        assert_eq!(reader_level(10_000), 16);
    }

    #[test]
    fn day_key_uses_china_standard_time() {
        assert_eq!(day_key(0), 0);
        assert_eq!(day_key(16 * 60 * 60 * 1_000), 1);
    }
}
