use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::warn;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CredentialID, Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential,
};

use crate::{AppError, AppState, issue_session, now_ms, require_admin, verify_origin};

const PASSKEY_FLOW_TTL_MS: i64 = 5 * 60 * 1_000;

#[derive(FromRow)]
struct PasskeyRow {
    id: String,
    name: String,
    passkey_json: String,
    created_at: i64,
    last_used_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasskeyItem {
    id: String,
    name: String,
    device_type: &'static str,
    backed_up: bool,
    created_at: i64,
    last_used_at: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RegistrationVerifyBody {
    flow_id: String,
    response: RegisterPublicKeyCredential,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuthenticationVerifyBody {
    flow_id: String,
    response: PublicKeyCredential,
}

pub(super) async fn list_passkeys(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let rows = sqlx::query_as::<_, PasskeyRow>(
        "SELECT id, name, passkey_json, created_at, last_used_at FROM admin_passkeys WHERE email = ? ORDER BY created_at DESC",
    )
    .bind(&state.config.admin_email)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .into_iter()
        .map(|row| PasskeyItem {
            id: row.id,
            name: row.name,
            device_type: "unknown",
            backed_up: false,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        })
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({ "passkeys": items })))
}

pub(super) async fn registration_options(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let passkeys = load_passkeys(&state).await?;
    let exclude = passkeys
        .iter()
        .map(|(_, passkey)| passkey.cred_id().clone())
        .collect::<Vec<CredentialID>>();
    let (options, registration) = state
        .webauthn
        .start_passkey_registration(
            admin_user_id(),
            &state.config.admin_email,
            "reshi",
            (!exclude.is_empty()).then_some(exclude),
        )
        .map_err(|error| webauthn_error("start passkey registration", error))?;
    let flow_id = store_flow(&state, "registration", &registration).await?;
    Ok(Json(serde_json::json!({
        "flowId": flow_id,
        "options": options,
    })))
}

pub(super) async fn verify_registration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RegistrationVerifyBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let registration: PasskeyRegistration =
        consume_flow(&state, &body.flow_id, "registration").await?;
    let passkey = state
        .webauthn
        .finish_passkey_registration(&body.response, &registration)
        .map_err(|error| webauthn_error("finish passkey registration", error))?;
    let id = credential_id_string(passkey.cred_id())?;
    let passkey_json = serde_json::to_string(&passkey).map_err(|_| AppError::Internal)?;
    let name = normalized_name(body.name.as_deref());
    let now = now_ms();
    sqlx::query(
        "INSERT INTO admin_passkeys (id, email, user_id, passkey_json, name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET passkey_json = excluded.passkey_json, name = excluded.name",
    )
    .bind(&id)
    .bind(&state.config.admin_email)
    .bind(admin_user_id().to_string())
    .bind(passkey_json)
    .bind(&name)
    .bind(now)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true, "name": name })))
}

pub(super) async fn authentication_options(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let passkeys = load_passkeys(&state).await?;
    if passkeys.is_empty() {
        return Err(AppError::NotFound("尚未注册 Passkey"));
    }
    let credentials = passkeys
        .iter()
        .map(|(_, passkey)| passkey.clone())
        .collect::<Vec<_>>();
    let (options, authentication) = state
        .webauthn
        .start_passkey_authentication(&credentials)
        .map_err(|error| webauthn_error("start passkey authentication", error))?;
    let flow_id = store_flow(&state, "authentication", &authentication).await?;
    Ok(Json(serde_json::json!({
        "flowId": flow_id,
        "options": options,
    })))
}

pub(super) async fn verify_authentication(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AuthenticationVerifyBody>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let authentication: PasskeyAuthentication =
        consume_flow(&state, &body.flow_id, "authentication").await?;
    let result = state
        .webauthn
        .finish_passkey_authentication(&body.response, &authentication)
        .map_err(|error| webauthn_error("finish passkey authentication", error))?;
    let credential_id = credential_id_from_response(&body.response)?;
    let mut passkeys = load_passkeys(&state).await?;
    for (row, passkey) in &mut passkeys {
        passkey.update_credential(&result);
        let passkey_json = serde_json::to_string(passkey).map_err(|_| AppError::Internal)?;
        sqlx::query("UPDATE admin_passkeys SET passkey_json = ?, last_used_at = CASE WHEN id = ? THEN ? ELSE last_used_at END WHERE id = ?")
            .bind(passkey_json)
            .bind(&credential_id)
            .bind(now_ms())
            .bind(&row.id)
            .execute(&state.db)
            .await?;
    }
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

async fn load_passkeys(state: &AppState) -> Result<Vec<(PasskeyRow, Passkey)>, AppError> {
    let rows = sqlx::query_as::<_, PasskeyRow>(
        "SELECT id, name, passkey_json, created_at, last_used_at FROM admin_passkeys WHERE email = ? ORDER BY created_at DESC",
    )
    .bind(&state.config.admin_email)
    .fetch_all(&state.db)
    .await?;
    rows.into_iter()
        .map(|row| {
            let passkey = serde_json::from_str(&row.passkey_json).map_err(|error| {
                warn!(%error, id = %row.id, "invalid stored passkey");
                AppError::Internal
            })?;
            Ok((row, passkey))
        })
        .collect()
}

async fn store_flow<T: Serialize>(
    state: &AppState,
    purpose: &str,
    value: &T,
) -> Result<String, AppError> {
    let flow_id = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let state_json = serde_json::to_string(value).map_err(|_| AppError::Internal)?;
    let now = now_ms();
    sqlx::query("DELETE FROM admin_passkey_challenges WHERE expires_at <= ?")
        .bind(now)
        .execute(&state.db)
        .await?;
    sqlx::query("INSERT INTO admin_passkey_challenges (flow_id, purpose, state_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&flow_id)
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
    purpose: &str,
) -> Result<T, AppError> {
    let state_json: Option<String> = sqlx::query_scalar(
        "DELETE FROM admin_passkey_challenges WHERE flow_id = ? AND purpose = ? AND expires_at > ? RETURNING state_json",
    )
    .bind(flow_id)
    .bind(purpose)
    .bind(now_ms())
    .fetch_optional(&state.db)
    .await?;
    let state_json = state_json.ok_or_else(|| {
        AppError::BadRequest("Passkey challenge 已失效，请重新开始".into())
    })?;
    serde_json::from_str(&state_json).map_err(|error| {
        warn!(%error, purpose, "invalid stored passkey challenge");
        AppError::Internal
    })
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

fn normalized_name(value: Option<&str>) -> String {
    let value = value.unwrap_or("我的设备").trim();
    if value.is_empty() {
        "我的设备".into()
    } else {
        value.chars().take(40).collect()
    }
}

fn admin_user_id() -> Uuid {
    Uuid::from_bytes([
        0x72, 0x65, 0x73, 0x68, 0x69, 0x2d, 0x64, 0x69, 0x61, 0x72, 0x79, 0x2d, 0x61, 0x64,
        0x6d, 0x69,
    ])
}

fn webauthn_error(context: &'static str, error: impl std::fmt::Display) -> AppError {
    warn!(%error, context, "passkey operation failed");
    AppError::BadRequest("Passkey 验证失败，请重试".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_user_id_is_stable() {
        assert_eq!(admin_user_id(), admin_user_id());
        assert_eq!(admin_user_id().as_bytes().len(), 16);
    }

    #[test]
    fn passkey_names_are_trimmed_and_limited() {
        assert_eq!(normalized_name(Some("  phone  ")), "phone");
        assert_eq!(normalized_name(Some("   ")), "我的设备");
        assert_eq!(normalized_name(Some(&"x".repeat(50))).len(), 40);
    }
}

