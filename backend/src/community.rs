use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::{AppError, AppState, now_ms, users, verify_origin};

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct CommentItem {
    id: i64,
    parent_id: Option<i64>,
    body: String,
    created_at: i64,
    user_id: String,
    display_name: String,
}

#[derive(Serialize, FromRow)]
struct ReactionCount {
    kind: String,
    count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommentBody {
    body: Option<String>,
    parent_id: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct ReactionBody {
    kind: Option<String>,
}

pub(crate) async fn get_community(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let post_id = public_post_id(&state, &slug).await?;
    let user = users::optional_user(&state, &headers).await?;
    let comments = sqlx::query_as::<_, CommentItem>(
        "SELECT comments.id, comments.parent_id, comments.body, comments.created_at, users.id AS user_id, users.display_name FROM comments JOIN users ON users.id = comments.user_id WHERE comments.post_id = ? ORDER BY comments.created_at ASC, comments.id ASC",
    )
    .bind(post_id)
    .fetch_all(&state.db)
    .await?;
    let reactions = reaction_counts(&state, post_id).await?;
    let my_reactions = if let Some(user) = user {
        sqlx::query_scalar::<_, String>(
            "SELECT kind FROM post_reactions WHERE post_id = ? AND user_id = ? ORDER BY kind",
        )
        .bind(post_id)
        .bind(user.id)
        .fetch_all(&state.db)
        .await?
    } else {
        Vec::new()
    };
    Ok(Json(serde_json::json!({
        "comments": comments,
        "reactions": reactions,
        "myReactions": my_reactions,
    })))
}

pub(crate) async fn create_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<CommentBody>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let user = users::require_user(&state, &headers).await?;
    let post_id = public_post_id(&state, &slug).await?;
    let body = normalize_comment(input.body.as_deref())?;
    if let Some(parent_id) = input.parent_id {
        let parent_exists: Option<i64> =
            sqlx::query_scalar("SELECT id FROM comments WHERE id = ? AND post_id = ? LIMIT 1")
                .bind(parent_id)
                .bind(post_id)
                .fetch_optional(&state.db)
                .await?;
        if parent_exists.is_none() {
            return Err(AppError::BadRequest("回复的评论不存在".into()));
        }
    }
    let now = now_ms();
    let result = sqlx::query(
        "INSERT INTO comments (post_id, user_id, parent_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(post_id)
    .bind(&user.id)
    .bind(input.parent_id)
    .bind(&body)
    .bind(now)
    .bind(now)
    .execute(&state.db)
    .await?;
    let comment = sqlx::query_as::<_, CommentItem>(
        "SELECT comments.id, comments.parent_id, comments.body, comments.created_at, users.id AS user_id, users.display_name FROM comments JOIN users ON users.id = comments.user_id WHERE comments.id = ? LIMIT 1",
    )
    .bind(result.last_insert_rowid())
    .fetch_one(&state.db)
    .await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "comment": comment })),
    ))
}

pub(crate) async fn toggle_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<ReactionBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let user = users::require_user(&state, &headers).await?;
    let post_id = public_post_id(&state, &slug).await?;
    let kind = match input.kind.as_deref() {
        Some("heart") => "heart",
        Some("spark") => "spark",
        Some("insight") => "insight",
        _ => return Err(AppError::BadRequest("回应类型无效".into())),
    };
    let deleted =
        sqlx::query("DELETE FROM post_reactions WHERE post_id = ? AND user_id = ? AND kind = ?")
            .bind(post_id)
            .bind(&user.id)
            .bind(kind)
            .execute(&state.db)
            .await?
            .rows_affected()
            > 0;
    if !deleted {
        sqlx::query(
            "INSERT INTO post_reactions (post_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(post_id)
        .bind(&user.id)
        .bind(kind)
        .bind(now_ms())
        .execute(&state.db)
        .await?;
    }
    Ok(Json(serde_json::json!({
        "active": !deleted,
        "reactions": reaction_counts(&state, post_id).await?,
    })))
}

async fn public_post_id(state: &AppState, slug: &str) -> Result<i64, AppError> {
    sqlx::query_scalar("SELECT id FROM posts WHERE slug = ? AND status = 'published' LIMIT 1")
        .bind(slug)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound("文章不存在"))
}

async fn reaction_counts(state: &AppState, post_id: i64) -> Result<Vec<ReactionCount>, AppError> {
    Ok(sqlx::query_as::<_, ReactionCount>(
        "SELECT kind, COUNT(*) AS count FROM post_reactions WHERE post_id = ? GROUP BY kind ORDER BY kind",
    )
    .bind(post_id)
    .fetch_all(&state.db)
    .await?)
}

fn normalize_comment(value: Option<&str>) -> Result<String, AppError> {
    let body = value.unwrap_or_default().trim();
    if body.is_empty() {
        return Err(AppError::BadRequest("评论内容不能为空".into()));
    }
    if body.chars().count() > 1_000 {
        return Err(AppError::BadRequest("评论不能超过 1000 个字符".into()));
    }
    Ok(body.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_are_trimmed_and_limited() {
        assert_eq!(normalize_comment(Some("  很喜欢  ")).unwrap(), "很喜欢");
        assert!(normalize_comment(Some(" ")).is_err());
        assert!(normalize_comment(Some(&"x".repeat(1_001))).is_err());
    }
}
