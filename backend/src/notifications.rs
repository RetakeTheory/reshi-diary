use axum::{Json, extract::State, http::HeaderMap};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{AppError, AppState, now_ms, require_admin, verify_origin};

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct NotificationRecord {
    id: i64,
    text: String,
    background_color: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotificationBody {
    text: Option<String>,
    background_color: Option<String>,
}

pub(crate) async fn get_active(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let notification = active_notification(&state).await?;
    Ok(Json(serde_json::json!({
        "notification": notification.as_ref().map(|item| serde_json::json!({
            "id": item.id,
            "text": item.text,
            "backgroundColor": item.background_color,
            "foregroundColor": foreground_for(&item.background_color),
            "updatedAt": item.updated_at,
        }))
    })))
}

pub(crate) async fn get_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let notification = active_notification(&state).await?;
    Ok(Json(serde_json::json!({ "notification": notification })))
}

pub(crate) async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<NotificationBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let text = input.text.unwrap_or_default().trim().to_owned();
    if text.is_empty() {
        return Err(AppError::BadRequest("请填写通知内容".into()));
    }
    if text.chars().count() > 300 {
        return Err(AppError::BadRequest("通知不能超过 300 个字符".into()));
    }
    let color = input
        .background_color
        .unwrap_or_else(|| "#7657F6".into())
        .to_uppercase();
    if !valid_hex_color(&color) {
        return Err(AppError::BadRequest(
            "通知底色必须是六位十六进制颜色".into(),
        ));
    }
    let now = now_ms();
    let mut transaction = state.db.begin().await?;
    sqlx::query("UPDATE notifications SET active = 0, updated_at = ? WHERE active = 1")
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    let result = sqlx::query("INSERT INTO notifications (text, background_color, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
        .bind(&text)
        .bind(&color)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    let notification = sqlx::query_as::<_, NotificationRecord>(
        "SELECT id, text, background_color, created_at, updated_at FROM notifications WHERE id = ? LIMIT 1",
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "notification": notification })))
}

pub(crate) async fn remove(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    sqlx::query("UPDATE notifications SET active = 0, updated_at = ? WHERE active = 1")
        .bind(now_ms())
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn active_notification(state: &AppState) -> Result<Option<NotificationRecord>, AppError> {
    Ok(sqlx::query_as::<_, NotificationRecord>(
        "SELECT id, text, background_color, created_at, updated_at FROM notifications WHERE active = 1 ORDER BY updated_at DESC LIMIT 1",
    )
    .fetch_optional(&state.db)
    .await?)
}

fn valid_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn foreground_for(background: &str) -> &'static str {
    let parse = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&background[range], 16).unwrap_or(0) as f32
    };
    let luminance = parse(1..3) * 0.299 + parse(3..5) * 0.587 + parse(5..7) * 0.114;
    if luminance > 155.0 {
        "#171326"
    } else {
        "#FFFFFF"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_colors_and_picks_contrast() {
        assert!(valid_hex_color("#7657F6"));
        assert!(!valid_hex_color("violet"));
        assert_eq!(foreground_for("#FFFFFF"), "#171326");
        assert_eq!(foreground_for("#171326"), "#FFFFFF");
    }
}
