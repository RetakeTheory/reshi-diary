use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::{error, info, warn};
use uuid::Uuid;
use webauthn_rs::prelude::{
    CredentialID, Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential,
};

use crate::{
    AppError, AppState, CODE_TTL_MS, SEND_COOLDOWN_MS, SESSION_TTL_MS, cookie_value,
    hash_value, now_ms, verify_origin,
};

pub(crate) const USER_SESSION_COOKIE: &str = "reshi_user_session";
const PASSKEY_FLOW_TTL_MS: i64 = 5 * 60 * 1_000;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserRecord {
    pub(crate) id: String,
    pub(crate) email: String,
    pub(crate) display_name: String,
    pub(crate) created_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendCodeBody {
    email: Option<String>,
    intent: Option<String>,
    display_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerifyCodeBody {
    email: Option<String>,
    code: Option<String>,
    intent: Option<String>,
}

#[derive(FromRow)]
struct LoginCode {
    id: i64,
    code_hash: String,
    salt: String,
    attempts: i64,
    expires_at: i64,
    display_name: Option<String>,
}

#[derive(FromRow)]
struct PasskeyRow {
    id: String,
    passkey_json: String,
    name: String,
    created_at: i64,
    last_used_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasskeyItem {
    id: String,
    name: String,
    created_at: i64,
    last_used_at: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PasskeyAuthOptionsBody {
    email: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistrationVerifyBody {
    flow_id: String,
    response: RegisterPublicKeyCredential,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthenticationVerifyBody {
    flow_id: String,
    response: PublicKeyCredential,
}

pub(crate) async fn send_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SendCodeBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let email = normalize_email(body.email.as_deref())?;
    let intent = normalize_intent(body.intent.as_deref())?;
    let existing = find_user_by_email(&state, &email).await?;
    let display_name = match intent {
        "register" => {
            if existing.is_some() {
                return Err(AppError::Conflict("该邮箱已注册，请直接登录"));
            }
            Some(normalize_display_name(body.display_name.as_deref())?)
        }
        "login" => {
            if existing.is_none() {
                return Err(AppError::NotFound("该邮箱尚未注册"));
            }
            None
        }
        _ => unreachable!(),
    };

    let now = now_ms();
    let recent: Option<i64> = sqlx::query_scalar(
        "SELECT created_at FROM user_login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;
    if let Some(created_at) = recent
        && now - created_at < SEND_COOLDOWN_MS
    {
        return Err(AppError::RateLimited(
            ((SEND_COOLDOWN_MS - (now - created_at)) / 1_000) + 1,
        ));
    }

    let code = format!("{:06}", rand::random::<u32>() % 1_000_000);
    let salt = Uuid::new_v4().simple().to_string();
    let code_hash = hash_value(&format!("{email}:{code}:{salt}"));
    sqlx::query("DELETE FROM user_login_codes WHERE expires_at < ? OR used_at IS NOT NULL")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO user_login_codes (email, intent, display_name, code_hash, salt, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(&email)
        .bind(intent)
        .bind(display_name)
        .bind(&code_hash)
        .bind(&salt)
        .bind(now + CODE_TTL_MS)
        .bind(now)
        .execute(&state.db)
        .await?;

    if let Err(err) = deliver_user_code(&state, &email, &code).await {
        sqlx::query("DELETE FROM user_login_codes WHERE code_hash = ?")
            .bind(code_hash)
            .execute(&state.db)
            .await?;
        return Err(err);
    }
    Ok(Json(
        serde_json::json!({ "ok": true, "expiresIn": CODE_TTL_MS / 1_000 }),
    ))
}

pub(crate) async fn verify_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VerifyCodeBody>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let email = normalize_email(body.email.as_deref())?;
    let intent = normalize_intent(body.intent.as_deref())?;
    let code = body.code.unwrap_or_default().trim().to_owned();
    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::BadRequest("请输入 6 位验证码".into()));
    }
    let row = sqlx::query_as::<_, LoginCode>(
        "SELECT id, code_hash, salt, attempts, expires_at, display_name FROM user_login_codes WHERE email = ? AND intent = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&email)
    .bind(intent)
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
        sqlx::query("UPDATE user_login_codes SET attempts = attempts + 1 WHERE id = ?")
            .bind(row.id)
            .execute(&state.db)
            .await?;
        return Err(AppError::BadRequest("验证码不正确".into()));
    }
    sqlx::query("UPDATE user_login_codes SET used_at = ? WHERE id = ?")
        .bind(now)
        .bind(row.id)
        .execute(&state.db)
        .await?;

    let user = if intent == "register" {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(&email)
            .bind(row.display_name.unwrap_or_else(|| "新读者".into()))
            .bind(now)
            .bind(now)
            .execute(&state.db)
            .await?;
        find_user_by_id(&state, &id).await?
    } else {
        find_user_by_email(&state, &email)
            .await?
            .ok_or(AppError::NotFound("该邮箱尚未注册"))?
    };
    let cookie = issue_user_session(&state, &user.id).await?;
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        Json(serde_json::json!({ "ok": true, "user": user })),
    )
        .into_response())
}

pub(crate) async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = require_user(&state, &headers).await?;
    Ok(Json(serde_json::json!({ "user": user })))
}

pub(crate) async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    if let Some(token) = cookie_value(&headers, USER_SESSION_COOKIE) {
        sqlx::query("DELETE FROM user_sessions WHERE token_hash = ?")
            .bind(hash_value(token))
            .execute(&state.db)
            .await?;
    }
    let cookie = expired_user_cookie(&state)?;
    Ok((
        [(header::SET_COOKIE, cookie), (header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response())
}

pub(crate) async fn list_passkeys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = require_user(&state, &headers).await?;
    let rows = sqlx::query_as::<_, PasskeyRow>(
        "SELECT id, passkey_json, name, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    let passkeys = rows
        .into_iter()
        .map(|row| PasskeyItem {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        })
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({ "passkeys": passkeys })))
}

pub(crate) async fn registration_options(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let user = require_user(&state, &headers).await?;
    let user_uuid = Uuid::parse_str(&user.id).map_err(|_| AppError::Internal)?;
    let passkeys = load_passkeys(&state, &user.id).await?;
    let exclude = passkeys
        .iter()
        .map(|(_, passkey)| passkey.cred_id().clone())
        .collect::<Vec<CredentialID>>();
    let (options, registration) = state
        .webauthn
        .start_passkey_registration(
            user_uuid,
            &user.email,
            &user.display_name,
            (!exclude.is_empty()).then_some(exclude),
        )
        .map_err(|error| webauthn_error("start user passkey registration", error))?;
    let flow_id = store_flow(&state, &user.id, "registration", &registration).await?;
    Ok(Json(serde_json::json!({ "flowId": flow_id, "options": options })))
}

pub(crate) async fn verify_registration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegistrationVerifyBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let user = require_user(&state, &headers).await?;
    let registration: PasskeyRegistration =
        consume_flow(&state, &body.flow_id, &user.id, "registration").await?;
    let passkey = state
        .webauthn
        .finish_passkey_registration(&body.response, &registration)
        .map_err(|error| webauthn_error("finish user passkey registration", error))?;
    let id = credential_id_string(passkey.cred_id())?;
    let passkey_json = serde_json::to_string(&passkey).map_err(|_| AppError::Internal)?;
    let name = normalized_passkey_name(body.name.as_deref());
    let now = now_ms();
    sqlx::query("INSERT INTO user_passkeys (id, user_id, passkey_json, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET passkey_json = excluded.passkey_json, name = excluded.name")
        .bind(&id)
        .bind(&user.id)
        .bind(passkey_json)
        .bind(&name)
        .bind(now)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true, "name": name })))
}

pub(crate) async fn authentication_options(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PasskeyAuthOptionsBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let email = normalize_email(body.email.as_deref())?;
    let user = find_user_by_email(&state, &email)
        .await?
        .ok_or(AppError::NotFound("该邮箱尚未注册"))?;
    let passkeys = load_passkeys(&state, &user.id).await?;
    if passkeys.is_empty() {
        return Err(AppError::NotFound("该账户尚未登记 Passkey"));
    }
    let credentials = passkeys
        .iter()
        .map(|(_, passkey)| passkey.clone())
        .collect::<Vec<_>>();
    let (options, authentication) = state
        .webauthn
        .start_passkey_authentication(&credentials)
        .map_err(|error| webauthn_error("start user passkey authentication", error))?;
    let flow_id = store_flow(&state, &user.id, "authentication", &authentication).await?;
    Ok(Json(serde_json::json!({ "flowId": flow_id, "options": options })))
}

pub(crate) async fn verify_authentication(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AuthenticationVerifyBody>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let (user_id, authentication): (String, PasskeyAuthentication) =
        consume_auth_flow(&state, &body.flow_id).await?;
    let result = state
        .webauthn
        .finish_passkey_authentication(&body.response, &authentication)
        .map_err(|error| webauthn_error("finish user passkey authentication", error))?;
    let credential_id = credential_id_from_response(&body.response)?;
    let mut passkeys = load_passkeys(&state, &user_id).await?;
    for (row, passkey) in &mut passkeys {
        passkey.update_credential(&result);
        let passkey_json = serde_json::to_string(passkey).map_err(|_| AppError::Internal)?;
        sqlx::query("UPDATE user_passkeys SET passkey_json = ?, last_used_at = CASE WHEN id = ? THEN ? ELSE last_used_at END WHERE id = ? AND user_id = ?")
            .bind(passkey_json)
            .bind(&credential_id)
            .bind(now_ms())
            .bind(&row.id)
            .bind(&user_id)
            .execute(&state.db)
            .await?;
    }
    let user = find_user_by_id(&state, &user_id).await?;
    let cookie = issue_user_session(&state, &user_id).await?;
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        Json(serde_json::json!({ "ok": true, "user": user })),
    )
        .into_response())
}

pub(crate) async fn require_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<UserRecord, AppError> {
    optional_user(state, headers)
        .await?
        .ok_or(AppError::Unauthorized)
}

pub(crate) async fn optional_user(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<UserRecord>, AppError> {
    let Some(token) = cookie_value(headers, USER_SESSION_COOKIE) else {
        return Ok(None);
    };
    let user = sqlx::query_as::<_, UserRecord>(
        "SELECT users.id, users.email, users.display_name, users.created_at FROM user_sessions JOIN users ON users.id = user_sessions.user_id WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ? LIMIT 1",
    )
    .bind(hash_value(token))
    .bind(now_ms())
    .fetch_optional(&state.db)
    .await?;
    Ok(user)
}

async fn issue_user_session(state: &AppState, user_id: &str) -> Result<HeaderValue, AppError> {
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let now = now_ms();
    sqlx::query("DELETE FROM user_sessions WHERE expires_at <= ?")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(hash_value(&token))
        .bind(user_id)
        .bind(now)
        .bind(now + SESSION_TTL_MS)
        .execute(&state.db)
        .await?;
    user_cookie(state, &token, SESSION_TTL_MS / 1_000)
}

fn expired_user_cookie(state: &AppState) -> Result<HeaderValue, AppError> {
    user_cookie(state, "", 0)
}

fn user_cookie(state: &AppState, token: &str, max_age: i64) -> Result<HeaderValue, AppError> {
    let secure = if state.config.session_secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{USER_SESSION_COOKIE}={token}; Path=/; HttpOnly{secure}; SameSite=Lax; Max-Age={max_age}"
    ))
    .map_err(|_| AppError::Internal)
}

async fn find_user_by_email(
    state: &AppState,
    email: &str,
) -> Result<Option<UserRecord>, AppError> {
    Ok(sqlx::query_as::<_, UserRecord>(
        "SELECT id, email, display_name, created_at FROM users WHERE email = ? LIMIT 1",
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await?)
}

async fn find_user_by_id(state: &AppState, id: &str) -> Result<UserRecord, AppError> {
    sqlx::query_as::<_, UserRecord>(
        "SELECT id, email, display_name, created_at FROM users WHERE id = ? LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)
}

async fn deliver_user_code(state: &AppState, email: &str, code: &str) -> Result<(), AppError> {
    let Some(api_key) = &state.config.resend_api_key else {
        if cfg!(debug_assertions) {
            info!(%email, login_code = code, "RESEND_API_KEY absent; local user login code");
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
            "to": [email],
            "subject": "reshi 日记本登录验证码",
            "html": format!("<p>你的登录验证码：</p><p style=\"font-size:32px;font-weight:700\">{code}</p><p>10 分钟内有效。若非本人操作，请忽略。</p>")
        }))
        .send()
        .await
        .map_err(|err| {
            error!(%err, "resend user email request failed");
            AppError::Upstream("邮件暂时发送失败")
        })?;
    if !response.status().is_success() {
        error!(status = %response.status(), "resend rejected user email");
        return Err(AppError::Upstream("邮件暂时发送失败"));
    }
    Ok(())
}

async fn load_passkeys(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<(PasskeyRow, Passkey)>, AppError> {
    let rows = sqlx::query_as::<_, PasskeyRow>(
        "SELECT id, passkey_json, name, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;
    rows.into_iter()
        .map(|row| {
            let passkey = serde_json::from_str(&row.passkey_json).map_err(|error| {
                warn!(%error, id = %row.id, "invalid stored user passkey");
                AppError::Internal
            })?;
            Ok((row, passkey))
        })
        .collect()
}

async fn store_flow<T: Serialize>(
    state: &AppState,
    user_id: &str,
    purpose: &str,
    value: &T,
) -> Result<String, AppError> {
    let flow_id = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let state_json = serde_json::to_string(value).map_err(|_| AppError::Internal)?;
    let now = now_ms();
    sqlx::query("DELETE FROM user_passkey_challenges WHERE expires_at <= ?")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO user_passkey_challenges (flow_id, user_id, purpose, state_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&flow_id)
        .bind(user_id)
        .bind(purpose)
        .bind(state_json)
        .bind(now)
        .bind(now + PASSKEY_FLOW_TTL_MS)
        .execute(&state.db)
        .await?;
    Ok(flow_id)
}

async fn consume_flow<T: for<'de> Deserialize<'de>>(
    state: &AppState,
    flow_id: &str,
    user_id: &str,
    purpose: &str,
) -> Result<T, AppError> {
    let state_json: Option<String> = sqlx::query_scalar(
        "DELETE FROM user_passkey_challenges WHERE flow_id = ? AND user_id = ? AND purpose = ? AND expires_at > ? RETURNING state_json",
    )
    .bind(flow_id)
    .bind(user_id)
    .bind(purpose)
    .bind(now_ms())
    .fetch_optional(&state.db)
    .await?;
    let state_json = state_json
        .ok_or_else(|| AppError::BadRequest("Passkey 请求已失效，请重新开始".into()))?;
    serde_json::from_str(&state_json).map_err(|_| AppError::Internal)
}

async fn consume_auth_flow(
    state: &AppState,
    flow_id: &str,
) -> Result<(String, PasskeyAuthentication), AppError> {
    let row: Option<(String, String)> = sqlx::query_as(
        "DELETE FROM user_passkey_challenges WHERE flow_id = ? AND purpose = 'authentication' AND expires_at > ? RETURNING user_id, state_json",
    )
    .bind(flow_id)
    .bind(now_ms())
    .fetch_optional(&state.db)
    .await?;
    let (user_id, state_json) = row
        .ok_or_else(|| AppError::BadRequest("Passkey 请求已失效，请重新开始".into()))?;
    let authentication = serde_json::from_str(&state_json).map_err(|_| AppError::Internal)?;
    Ok((user_id, authentication))
}

fn normalize_email(value: Option<&str>) -> Result<String, AppError> {
    let email = value.unwrap_or_default().trim().to_lowercase();
    let valid = email.len() <= 254
        && email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.') && !domain.ends_with('.'));
    if !valid {
        return Err(AppError::BadRequest("请输入有效邮箱地址".into()));
    }
    Ok(email)
}

fn normalize_intent(value: Option<&str>) -> Result<&'static str, AppError> {
    match value {
        Some("register") => Ok("register"),
        Some("login") => Ok("login"),
        _ => Err(AppError::BadRequest("登录类型无效".into())),
    }
}

fn normalize_display_name(value: Option<&str>) -> Result<String, AppError> {
    let value = value.unwrap_or_default().trim();
    if value.is_empty() {
        return Err(AppError::BadRequest("请填写显示名称".into()));
    }
    Ok(value.chars().take(40).collect())
}

fn normalized_passkey_name(value: Option<&str>) -> String {
    let value = value.unwrap_or("我的设备").trim();
    if value.is_empty() {
        "我的设备".into()
    } else {
        value.chars().take(40).collect()
    }
}

fn credential_id_string(id: &CredentialID) -> Result<String, AppError> {
    serde_json::to_value(id)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .ok_or(AppError::Internal)
}

fn credential_id_from_response<T: Serialize>(response: &T) -> Result<String, AppError> {
    serde_json::to_value(response)
        .ok()
        .and_then(|value| value.get("id").and_then(|id| id.as_str()).map(ToOwned::to_owned))
        .ok_or(AppError::Internal)
}

fn webauthn_error(context: &'static str, error: impl std::fmt::Display) -> AppError {
    warn!(%error, context, "user passkey operation failed");
    AppError::BadRequest("Passkey 验证失败，请重试".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_validation_rejects_invalid_values() {
        assert!(normalize_email(Some("reader@example.com")).is_ok());
        assert!(normalize_email(Some("invalid")).is_err());
    }

    #[test]
    fn display_name_is_trimmed_and_limited() {
        assert_eq!(normalize_display_name(Some("  小树  ")).unwrap(), "小树");
        assert_eq!(normalize_display_name(Some(&"x".repeat(50))).unwrap().len(), 40);
    }
}
