use std::{collections::HashMap, sync::Arc, time::Duration};

use ammonia::Builder as HtmlSanitizer;
use axum::{
    Json,
    extract::{Multipart, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use tokio::sync::{Mutex, RwLock, mpsc, oneshot};
use uuid::Uuid;

use crate::{AppError, AppState, hash_value, html_to_plain_text, now_ms, require_admin, users, verify_origin};

const QQ_AUTH_TTL_MS: i64 = 10 * 60 * 1_000;
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_CARD_HTML_CHARS: usize = 20_000;

#[derive(Clone)]
struct BotConnection {
    generation: String,
    sender: mpsc::Sender<Message>,
}

pub(crate) struct OneBotHub {
    connection: RwLock<Option<BotConnection>>,
    pending: Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>,
}

impl OneBotHub {
    pub(crate) fn new() -> Self {
        Self {
            connection: RwLock::new(None),
            pending: Mutex::new(HashMap::new()),
        }
    }

    async fn connect(&self, generation: String, sender: mpsc::Sender<Message>) {
        *self.connection.write().await = Some(BotConnection { generation, sender });
    }

    async fn disconnect(&self, generation: &str) {
        let mut connection = self.connection.write().await;
        if connection.as_ref().is_some_and(|value| value.generation == generation) {
            *connection = None;
        }
    }

    async fn is_connected(&self) -> bool {
        self.connection.read().await.is_some()
    }

    async fn resolve(&self, payload: serde_json::Value) -> bool {
        let Some(echo) = payload.get("echo").and_then(serde_json::Value::as_str) else {
            return false;
        };
        let sender = self.pending.lock().await.remove(echo);
        sender.is_some_and(|sender| sender.send(payload).is_ok())
    }

    async fn call(
        &self,
        action: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, AppError> {
        let sender = self
            .connection
            .read()
            .await
            .as_ref()
            .map(|value| value.sender.clone())
            .ok_or(AppError::Unavailable("QQ Bot 当前未连接"))?;
        let echo = Uuid::new_v4().simple().to_string();
        let (result_tx, result_rx) = oneshot::channel();
        self.pending.lock().await.insert(echo.clone(), result_tx);
        let payload = serde_json::json!({"action":action,"params":params,"echo":echo});
        if sender.send(Message::Text(payload.to_string().into())).await.is_err() {
            self.pending.lock().await.remove(&echo);
            return Err(AppError::Unavailable("QQ Bot 连接已断开"));
        }
        match tokio::time::timeout(Duration::from_secs(20), result_rx).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(_)) => Err(AppError::Upstream("QQ Bot 未返回结果")),
            Err(_) => {
                self.pending.lock().await.remove(&echo);
                Err(AppError::Upstream("QQ Bot 响应超时"))
            }
        }
    }
}

struct OneBotConfig<'a> {
    access_token: &'a str,
    bot_id: &'a str,
    allowed_group_ids: &'a [String],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthStartBody {
    intent: Option<String>,
    display_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FlowBody {
    flow_id: Option<String>,
}

#[derive(Debug, FromRow)]
struct Challenge {
    flow_id: String,
    purpose: String,
    user_id: Option<String>,
    display_name: Option<String>,
    verified_qq_id: Option<String>,
    status: String,
    error: Option<String>,
    expires_at: i64,
}

pub(crate) async fn websocket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let config = onebot_config(&state)?;
    let provided = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();
    if !constant_secret_eq(provided, config.access_token) {
        return Ok(StatusCode::UNAUTHORIZED.into_response());
    }
    Ok(ws
        .on_upgrade(move |socket| socket_loop(Arc::new(state), socket))
        .into_response())
}

async fn socket_loop(state: Arc<AppState>, socket: WebSocket) {
    let bot_id = match onebot_config(&state) {
        Ok(config) => config.bot_id.to_owned(),
        Err(_) => return,
    };
    let generation = Uuid::new_v4().simple().to_string();
    let (outbound, mut outgoing) = mpsc::channel::<Message>(32);
    let (mut socket_sender, mut socket_receiver) = socket.split();
    let mut registered = false;
    loop {
        tokio::select! {
            message = socket_receiver.next() => {
                let Some(Ok(message)) = message else { break };
                match message {
                    Message::Text(text) => {
                        let Ok(payload) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
                        if state.onebot.resolve(payload.clone()).await { continue; }
                        if json_id(payload.get("self_id")).as_deref() != Some(&bot_id) { continue; }
                        if !registered {
                            state.onebot.connect(generation.clone(), outbound.clone()).await;
                            registered = true;
                        }
                        if let Some((user_id, reply)) = process_event(&state, &payload).await {
                            let action = serde_json::json!({
                                "action":"send_private_msg",
                                "params":{"user_id":user_id,"message":reply,"auto_escape":true}
                            });
                            let _ = outbound.send(Message::Text(action.to_string().into())).await;
                        }
                    }
                    Message::Ping(value) => {
                        if socket_sender.send(Message::Pong(value)).await.is_err() { break; }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            message = outgoing.recv() => {
                let Some(message) = message else { break };
                if socket_sender.send(message).await.is_err() { break; }
            }
        }
    }
    if registered {
        state.onebot.disconnect(&generation).await;
    }
}

async fn process_event(state: &AppState, payload: &serde_json::Value) -> Option<(i64, String)> {
    if payload.get("post_type").and_then(serde_json::Value::as_str) != Some("message")
        || payload.get("message_type").and_then(serde_json::Value::as_str) != Some("private")
    {
        return None;
    }
    let qq_id = json_id(payload.get("user_id")).filter(|value| is_numeric_id(value))?;
    let user_number = qq_id.parse::<i64>().ok()?;
    let code = payload
        .get("raw_message")
        .and_then(serde_json::Value::as_str)
        .and_then(parse_verification_message)?;
    let row = sqlx::query_as::<_, Challenge>("SELECT flow_id, purpose, user_id, display_name, verified_qq_id, status, error, expires_at FROM qq_auth_challenges WHERE code_hash = ? LIMIT 1")
        .bind(hash_value(&format!("qq-auth:{code}")))
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
    let now = now_ms();
    let Some(row) = row.filter(|row| row.status == "pending" && row.expires_at > now) else {
        return Some((user_number, "验证码无效、已过期或已使用，请回网站重新获取。".into()));
    };
    let mut failure = None;
    if row.purpose == "login" {
        let exists = sqlx::query_scalar::<_, i64>("SELECT 1 FROM qq_bindings WHERE qq_id = ? LIMIT 1")
            .bind(&qq_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .is_some();
        if !exists {
            failure = Some("该 QQ 尚未注册，请在网站选择 QQ 注册。");
        }
    }
    if row.purpose == "bind" {
        let owner = sqlx::query_scalar::<_, String>("SELECT user_id FROM qq_bindings WHERE qq_id = ? LIMIT 1")
            .bind(&qq_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        let current = sqlx::query_scalar::<_, String>("SELECT qq_id FROM qq_bindings WHERE user_id = ? LIMIT 1")
            .bind(&row.user_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        if owner.as_deref().is_some_and(|id| Some(id) != row.user_id.as_deref()) {
            failure = Some("该 QQ 已绑定其他网站账户。");
        } else if current.as_deref().is_some_and(|id| id != qq_id) {
            failure = Some("该网站账户已绑定其他 QQ，请先解绑。");
        }
    }
    if let Some(message) = failure {
        let _ = sqlx::query("UPDATE qq_auth_challenges SET status = 'failed', error = ?, verified_at = ? WHERE flow_id = ? AND status = 'pending'")
            .bind(message)
            .bind(now)
            .bind(&row.flow_id)
            .execute(&state.db)
            .await;
        return Some((user_number, message.into()));
    }
    if sqlx::query("UPDATE qq_auth_challenges SET status = 'verified', verified_qq_id = ?, verified_at = ? WHERE flow_id = ? AND status = 'pending'")
        .bind(&qq_id)
        .bind(now)
        .bind(&row.flow_id)
        .execute(&state.db)
        .await
        .is_err()
    {
        return Some((user_number, "验证服务暂时不可用，请稍后重试。".into()));
    }
    Some((
        user_number,
        if row.purpose == "bind" {
            "身份验证成功，请返回网站完成绑定。"
        } else {
            "身份验证成功，请返回网站完成登录。"
        }
        .into(),
    ))
}

pub(crate) async fn start_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AuthStartBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let config = onebot_config(&state)?;
    if !state.onebot.is_connected().await {
        return Err(AppError::Unavailable("QQ Bot 当前未连接"));
    }
    let purpose = if body.intent.as_deref() == Some("register") { "register" } else { "login" };
    let display_name = if purpose == "register" {
        let name = normalize_display_name(body.display_name.as_deref())?;
        if sqlx::query_scalar::<_, i64>("SELECT 1 FROM users WHERE display_name_key = ? LIMIT 1")
            .bind(display_name_key(&name))
            .fetch_optional(&state.db)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict("该昵称已被使用"));
        }
        Some(name)
    } else {
        None
    };
    let challenge = create_challenge(&state, &headers, purpose, None, display_name).await?;
    Ok(Json(serde_json::json!({
        "flowId":challenge.flow_id,
        "code":challenge.code,
        "command":format!("验证 {}", challenge.code),
        "expiresAt":challenge.expires_at,
        "botId":config.bot_id,
    })))
}

pub(crate) async fn complete_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<FlowBody>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let config = onebot_config(&state)?;
    let flow_id = valid_flow_id(body.flow_id.as_deref())?;
    let row = challenge_by_flow(&state, flow_id).await?;
    if row.expires_at <= now_ms() {
        return Ok(status_json(
            StatusCode::GONE,
            serde_json::json!({"status":"expired","error":"验证已过期，请重新开始"}),
        ));
    }
    if row.status == "pending" {
        return Ok(status_json(
            StatusCode::ACCEPTED,
            serde_json::json!({"status":"pending"}),
        ));
    }
    if row.status == "failed" {
        return Ok(status_json(
            StatusCode::CONFLICT,
            serde_json::json!({
                "status":"failed",
                "error":row.error.unwrap_or_else(|| "QQ 验证失败".into())
            }),
        ));
    }
    if row.status != "verified" || !matches!(row.purpose.as_str(), "login" | "register") {
        return Err(AppError::Conflict("验证请求已使用"));
    }
    let qq_id = row.verified_qq_id.ok_or(AppError::Internal)?;
    let mut user_id = sqlx::query_scalar::<_, String>("SELECT user_id FROM qq_bindings WHERE qq_id = ? LIMIT 1")
        .bind(&qq_id)
        .fetch_optional(&state.db)
        .await?;
    if user_id.is_none() && row.purpose == "login" {
        return Err(AppError::NotFound("该 QQ 尚未注册，请切换到 QQ 注册"));
    }
    let new_uid = if user_id.is_none() {
        Some(users::unique_uid(&state).await?)
    } else {
        None
    };
    let now = now_ms();
    let mut transaction = state.db.begin().await?;
    let consumed = sqlx::query("UPDATE qq_auth_challenges SET status = 'consumed', consumed_at = ? WHERE flow_id = ? AND status = 'verified'")
        .bind(now)
        .bind(&row.flow_id)
        .execute(&mut *transaction)
        .await?
        .rows_affected();
    if consumed == 0 {
        transaction.rollback().await?;
        return Err(AppError::Conflict("验证请求已使用"));
    }
    if user_id.is_none() {
        let id = Uuid::new_v4().to_string();
        let name = row
            .display_name
            .unwrap_or_else(|| format!("QQ用户{}", &qq_id[qq_id.len().saturating_sub(4)..]));
        if let Err(error) = sqlx::query("INSERT INTO users (id, uid, email, display_name, display_name_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(new_uid.ok_or(AppError::Internal)?)
            .bind(synthetic_qq_email(&qq_id))
            .bind(&name)
            .bind(display_name_key(&name))
            .bind(now)
            .bind(now)
            .execute(&mut *transaction)
            .await
        {
            transaction.rollback().await?;
            if error.to_string().contains("UNIQUE") {
                return Err(AppError::Conflict("昵称已被使用，请更换昵称后重试"));
            }
            return Err(error.into());
        }
        sqlx::query("INSERT INTO qq_bindings (user_id, qq_id, bot_id, bound_at) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(&qq_id)
            .bind(config.bot_id)
            .bind(now)
            .execute(&mut *transaction)
            .await?;
        user_id = Some(id);
    }
    transaction.commit().await?;
    let user_id = user_id.ok_or(AppError::Internal)?;
    let cookie = users::issue_user_session(&state, &user_id).await?;
    Ok(([
        (header::SET_COOKIE, cookie),
        (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
    ], Json(serde_json::json!({"ok":true,"status":"complete"}))).into_response())
}

pub(crate) async fn get_binding(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = users::require_user(&state, &headers).await?;
    let binding = sqlx::query_as::<_, (String, String, i64)>("SELECT qq_id, bot_id, bound_at FROM qq_bindings WHERE user_id = ? LIMIT 1")
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await?;
    let config = onebot_config(&state).ok();
    let online = state.onebot.is_connected().await;
    Ok(Json(serde_json::json!({
        "binding":binding.as_ref().map(|(qq_id,bot_id,bound_at)| serde_json::json!({"qqId":qq_id,"botId":bot_id,"boundAt":bound_at})),
        "botId":config.as_ref().map(|value| value.bot_id),
        "configured":config.is_some(),
        "online":online,
        "canUnbind":binding.is_some() && !is_synthetic_qq_email(&user.email),
    })))
}

pub(crate) async fn start_binding(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let config = onebot_config(&state)?;
    if !state.onebot.is_connected().await {
        return Err(AppError::Unavailable("QQ Bot 当前未连接"));
    }
    let user = users::require_user(&state, &headers).await?;
    if sqlx::query_scalar::<_, i64>("SELECT 1 FROM qq_bindings WHERE user_id = ? LIMIT 1")
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("当前账户已绑定 QQ"));
    }
    let challenge = create_challenge(&state, &headers, "bind", Some(user.id), None).await?;
    Ok(Json(serde_json::json!({
        "flowId":challenge.flow_id,
        "code":challenge.code,
        "command":format!("绑定 {}", challenge.code),
        "expiresAt":challenge.expires_at,
        "botId":config.bot_id,
    })))
}

pub(crate) async fn complete_binding(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<FlowBody>,
) -> Result<Response, AppError> {
    verify_origin(&state.config, &headers)?;
    let config = onebot_config(&state)?;
    let user = users::require_user(&state, &headers).await?;
    let flow_id = valid_flow_id(body.flow_id.as_deref())?;
    let row = challenge_by_flow(&state, flow_id).await?;
    if row.purpose != "bind" || row.user_id.as_deref() != Some(&user.id) {
        return Err(AppError::Forbidden);
    }
    if row.expires_at <= now_ms() {
        return Ok(status_json(
            StatusCode::GONE,
            serde_json::json!({"status":"expired","error":"验证已过期，请重新开始"}),
        ));
    }
    if row.status == "pending" {
        return Ok(status_json(
            StatusCode::ACCEPTED,
            serde_json::json!({"status":"pending"}),
        ));
    }
    if row.status == "failed" {
        return Ok(status_json(
            StatusCode::CONFLICT,
            serde_json::json!({
                "status":"failed",
                "error":row.error.unwrap_or_else(|| "QQ 验证失败".into())
            }),
        ));
    }
    if row.status != "verified" {
        return Err(AppError::Conflict("验证请求已使用"));
    }
    let qq_id = row.verified_qq_id.ok_or(AppError::Internal)?;
    let owner = sqlx::query_scalar::<_, String>("SELECT user_id FROM qq_bindings WHERE qq_id = ? LIMIT 1")
        .bind(&qq_id)
        .fetch_optional(&state.db)
        .await?;
    if owner.as_deref().is_some_and(|id| id != user.id) {
        return Err(AppError::Conflict("该 QQ 已绑定其他网站账户"));
    }
    let current = sqlx::query_scalar::<_, String>("SELECT qq_id FROM qq_bindings WHERE user_id = ? LIMIT 1")
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await?;
    if current.as_deref().is_some_and(|id| id != qq_id) {
        return Err(AppError::Conflict("当前网站账户已绑定其他 QQ"));
    }
    let now = now_ms();
    let mut transaction = state.db.begin().await?;
    let consumed = sqlx::query("UPDATE qq_auth_challenges SET status = 'consumed', consumed_at = ? WHERE flow_id = ? AND status = 'verified'")
        .bind(now)
        .bind(&row.flow_id)
        .execute(&mut *transaction)
        .await?
        .rows_affected();
    if consumed == 0 {
        transaction.rollback().await?;
        return Err(AppError::Conflict("验证请求已使用"));
    }
    sqlx::query("INSERT INTO qq_bindings (user_id, qq_id, bot_id, bound_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING")
        .bind(&user.id)
        .bind(&qq_id)
        .bind(config.bot_id)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(Json(serde_json::json!({"ok":true,"status":"complete","binding":{"qqId":qq_id,"boundAt":now}})).into_response())
}

pub(crate) async fn remove_binding(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let user = users::require_user(&state, &headers).await?;
    if is_synthetic_qq_email(&user.email) {
        return Err(AppError::Conflict("QQ 是当前账户唯一登录方式，添加邮箱登录后才能解绑"));
    }
    sqlx::query("DELETE FROM qq_bindings WHERE user_id = ?")
        .bind(&user.id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"ok":true})))
}

pub(crate) async fn get_admin_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    require_admin(&state, &headers).await?;
    let config = onebot_config(&state).ok();
    Ok(Json(serde_json::json!({
        "configured":config.is_some(),
        "online":state.onebot.is_connected().await,
        "botId":config.as_ref().map(|value| value.bot_id),
        "groupIds":config.as_ref().map(|value| value.allowed_group_ids).unwrap_or_default(),
        "reverseWsPath":"/api/onebot/ws",
    })))
}

pub(crate) async fn send_group_notice(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let config = onebot_config(&state)?;
    let declared = headers.get(header::CONTENT_LENGTH).and_then(|value| value.to_str().ok()).and_then(|value| value.parse::<usize>().ok()).unwrap_or_default();
    if declared > MAX_IMAGE_BYTES + 1024 * 1024 {
        return Err(AppError::BadRequest("图片不能超过 8 MB".into()));
    }
    let mut group_id = String::new();
    let mut mode = String::from("image");
    let mut caption = String::new();
    let mut title = String::new();
    let mut content_html = String::new();
    let mut target_url = String::new();
    let mut image = Vec::new();
    let mut content_type = String::new();
    while let Some(mut field) = multipart.next_field().await.map_err(|_| AppError::BadRequest("上传表单无效".into()))? {
        let name = field.name().unwrap_or_default().to_owned();
        if name == "image" {
            content_type = field.content_type().unwrap_or_default().to_ascii_lowercase();
            while let Some(chunk) = field.chunk().await.map_err(|_| AppError::BadRequest("图片读取失败".into()))? {
                if image.len() + chunk.len() > MAX_IMAGE_BYTES {
                    return Err(AppError::BadRequest("图片不能超过 8 MB".into()));
                }
                image.extend_from_slice(&chunk);
            }
        } else {
            let text = field.text().await.map_err(|_| AppError::BadRequest("上传表单无效".into()))?;
            if name == "groupId" { group_id = text.trim().to_owned(); }
            else if name == "mode" { mode = text.trim().to_owned(); }
            else if name == "caption" { caption = text.trim().chars().take(500).collect(); }
            else if name == "title" { title = text.trim().to_owned(); }
            else if name == "contentHtml" { content_html = text.trim().to_owned(); }
            else if name == "url" { target_url = text.trim().to_owned(); }
        }
    }
    if !config.allowed_group_ids.contains(&group_id) {
        return Err(AppError::Forbidden);
    }
    let group_number = group_id.parse::<i64>().map_err(|_| AppError::BadRequest("群号无效".into()))?;
    let (message, audit_caption, audit_type, audit_size) = if mode == "card" {
        let title_count = title.chars().count();
        if !(1..=100).contains(&title_count) {
            return Err(AppError::BadRequest("卡片标题需为 1–100 个字符".into()));
        }
        if content_html.chars().count() > MAX_CARD_HTML_CHARS {
            return Err(AppError::BadRequest("卡片正文不能超过 20000 字".into()));
        }
        let safe_html = HtmlSanitizer::default().clean(&content_html).to_string();
        let plain = html_to_plain_text(&safe_html);
        if plain.is_empty() {
            return Err(AppError::BadRequest("请填写卡片正文".into()));
        }
        let content = plain.chars().take(300).collect::<String>();
        let url = normalize_card_url(&state.config.public_origin, &target_url)?;
        let mut data = serde_json::json!({"url":url,"title":title.clone(),"content":content});
        if let Some(image_url) = first_card_image(&state.config.public_origin, &safe_html) {
            data.as_object_mut().ok_or(AppError::Internal)?.insert("image".into(), image_url.into());
        }
        (
            vec![serde_json::json!({"type":"share","data":data})],
            title,
            String::from("application/x-onebot-share"),
            content_html.len(),
        )
    } else if mode == "image" {
        if image.is_empty() || !is_safe_image_type(&content_type) {
            return Err(AppError::BadRequest("仅支持 AVIF、GIF、JPEG、PNG 或 WebP 图片".into()));
        }
        let mut message = Vec::new();
        if !caption.is_empty() {
            message.push(serde_json::json!({"type":"text","data":{"text":caption}}));
        }
        message.push(serde_json::json!({"type":"image","data":{"file":format!("base64://{}", STANDARD.encode(&image))}}));
        (message, caption, content_type, image.len())
    } else {
        return Err(AppError::BadRequest("通知类型无效".into()));
    };
    let result = state.onebot.call("send_group_msg", serde_json::json!({
        "group_id":group_number,
        "message":message,
        "auto_escape":false,
    })).await;
    let (status, message_id) = match result {
        Ok(payload) if payload.get("status").and_then(serde_json::Value::as_str) == Some("ok")
            && payload.get("retcode").and_then(serde_json::Value::as_i64) == Some(0) => {
                let id = payload
                    .get("data")
                    .and_then(|value| value.get("message_id"))
                    .map(json_id_value)
                    .unwrap_or_default();
                ("sent", id)
        }
        Ok(_) => ("failed", String::new()),
        Err(error) => {
            record_delivery(
                &state,
                DeliveryRecord {
                    bot_id: config.bot_id,
                    group_id: &group_id,
                    caption: &audit_caption,
                    content_type: &audit_type,
                    size: audit_size,
                    message_id: "",
                    status: "failed",
                },
            )
            .await?;
            return Err(error);
        }
    };
    record_delivery(
        &state,
        DeliveryRecord {
            bot_id: config.bot_id,
            group_id: &group_id,
            caption: &audit_caption,
            content_type: &audit_type,
            size: audit_size,
            message_id: &message_id,
            status,
        },
    )
    .await?;
    if status != "sent" {
        return Err(AppError::Upstream("QQ Bot 发送通知失败"));
    }
    Ok(Json(serde_json::json!({"ok":true,"messageId":message_id})))
}

struct DeliveryRecord<'a> {
    bot_id: &'a str,
    group_id: &'a str,
    caption: &'a str,
    content_type: &'a str,
    size: usize,
    message_id: &'a str,
    status: &'a str,
}

async fn record_delivery(state: &AppState, record: DeliveryRecord<'_>) -> Result<(), AppError> {
    sqlx::query("INSERT INTO onebot_delivery_log (admin_email, bot_id, group_id, caption, content_type, size, message_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&state.config.admin_email)
        .bind(record.bot_id)
        .bind(record.group_id)
        .bind(record.caption)
        .bind(record.content_type)
        .bind(record.size as i64)
        .bind((!record.message_id.is_empty()).then_some(record.message_id))
        .bind(record.status)
        .bind(now_ms())
        .execute(&state.db)
        .await?;
    Ok(())
}

struct CreatedChallenge { flow_id: String, code: String, expires_at: i64 }

async fn create_challenge(state: &AppState, headers: &HeaderMap, purpose: &str, user_id: Option<String>, display_name: Option<String>) -> Result<CreatedChallenge, AppError> {
    let now = now_ms();
    let request_key = request_key_hash(headers);
    let latest = sqlx::query_scalar::<_, i64>("SELECT created_at FROM qq_auth_challenges WHERE request_key_hash = ? ORDER BY created_at DESC LIMIT 1")
        .bind(&request_key).fetch_optional(&state.db).await?;
    if latest.is_some_and(|created| now - created < 20_000) { return Err(AppError::RateLimited(20)); }
    let recent = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM qq_auth_challenges WHERE request_key_hash = ? AND created_at > ?")
        .bind(&request_key).bind(now - QQ_AUTH_TTL_MS).fetch_one(&state.db).await?;
    if recent >= 10 { return Err(AppError::RateLimited(600)); }
    sqlx::query("DELETE FROM qq_auth_challenges WHERE expires_at <= ? OR (status IN ('consumed', 'failed') AND created_at < ?)")
        .bind(now).bind(now - QQ_AUTH_TTL_MS).execute(&state.db).await?;
    let flow_id = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let code = generate_code();
    let expires_at = now + QQ_AUTH_TTL_MS;
    sqlx::query("INSERT INTO qq_auth_challenges (flow_id, code_hash, purpose, user_id, display_name, request_key_hash, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
        .bind(&flow_id).bind(hash_value(&format!("qq-auth:{}", normalize_code(&code))))
        .bind(purpose).bind(user_id).bind(display_name).bind(request_key).bind(now).bind(expires_at)
        .execute(&state.db).await?;
    Ok(CreatedChallenge { flow_id, code, expires_at })
}

async fn challenge_by_flow(state: &AppState, flow_id: &str) -> Result<Challenge, AppError> {
    sqlx::query_as::<_, Challenge>("SELECT flow_id, purpose, user_id, display_name, verified_qq_id, status, error, expires_at FROM qq_auth_challenges WHERE flow_id = ? LIMIT 1")
        .bind(flow_id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound("验证请求不存在"))
}

fn onebot_config(state: &AppState) -> Result<OneBotConfig<'_>, AppError> {
    let (Some(access_token), Some(bot_id)) = (state.config.onebot_access_token.as_deref(), state.config.onebot_bot_id.as_deref()) else {
        return Err(AppError::Unavailable("OneBot 尚未完整配置"));
    };
    if state.config.onebot_allowed_group_ids.is_empty() { return Err(AppError::Unavailable("OneBot 群白名单尚未配置")); }
    Ok(OneBotConfig { access_token, bot_id, allowed_group_ids: &state.config.onebot_allowed_group_ids })
}

fn valid_flow_id(value: Option<&str>) -> Result<&str, AppError> {
    let value = value.unwrap_or_default();
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) { Ok(value) }
    else { Err(AppError::BadRequest("验证请求无效".into()) }
}

fn request_key_hash(headers: &HeaderMap) -> String {
    let ip = headers.get("cf-connecting-ip").or_else(|| headers.get("x-forwarded-for"))
        .and_then(|value| value.to_str().ok()).and_then(|value| value.split(',').next()).unwrap_or("unknown");
    let agent = headers.get(header::USER_AGENT).and_then(|value| value.to_str().ok()).unwrap_or("unknown");
    hash_value(&format!("qq-flow:{ip}:{}", agent.chars().take(160).collect::<String>()))
}

fn normalize_display_name(value: Option<&str>) -> Result<String, AppError> {
    let value = value.unwrap_or_default().trim();
    if !(2..=40).contains(&value.chars().count()) { return Err(AppError::BadRequest("昵称需为 2–40 个字符".into())); }
    Ok(value.to_owned())
}

fn display_name_key(value: &str) -> String { value.trim().to_lowercase() }
fn synthetic_qq_email(qq_id: &str) -> String { format!("qq-{qq_id}@qq.rettheory.local") }
fn is_synthetic_qq_email(email: &str) -> bool { email.starts_with("qq-") && email.ends_with("@qq.rettheory.local") }
fn is_numeric_id(value: &str) -> bool { (5..=20).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_digit()) }

fn generate_code() -> String {
    const ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let raw = (0..8).map(|_| ALPHABET[rand::random::<u8>() as usize % ALPHABET.len()] as char).collect::<String>();
    format!("{}-{}", &raw[..4], &raw[4..])
}

fn normalize_code(value: &str) -> String {
    value.chars().filter(|value| value.is_ascii_alphanumeric()).map(|value| value.to_ascii_uppercase()).collect()
}

fn parse_verification_message(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let code = ["绑定", "验证", "登录", "注册"].into_iter().find_map(|prefix| trimmed.strip_prefix(prefix))?;
    let normalized = normalize_code(code);
    (normalized.len() == 8 && normalized.bytes().all(|byte| matches!(byte, b'2'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z'))).then_some(normalized)
}

fn constant_secret_eq(left: &str, right: &str) -> bool {
    let left = Sha256::digest(left.as_bytes());
    let right = Sha256::digest(right.as_bytes());
    left.iter().zip(right).fold(0u8, |difference, (left, right)| difference | (left ^ right)) == 0
}

fn json_id(value: Option<&serde_json::Value>) -> Option<String> { value.map(json_id_value).filter(|value| !value.is_empty()) }
fn json_id_value(value: &serde_json::Value) -> String {
    value.as_str().map(ToOwned::to_owned).or_else(|| value.as_i64().map(|value| value.to_string())).unwrap_or_default()
}

fn is_safe_image_type(value: &str) -> bool {
    matches!(value.split(';').next().unwrap_or_default(), "image/avif" | "image/gif" | "image/jpeg" | "image/png" | "image/webp")
}

fn normalize_card_url(public_origin: &str, value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(public_origin.to_owned());
    }
    if value.starts_with('/') && !value.starts_with("//") {
        return Ok(format!("{public_origin}{value}"));
    }
    let parsed = reqwest::Url::parse(value)
        .map_err(|_| AppError::BadRequest("卡片链接需为 HTTPS 地址或站内路径".into()))?;
    if parsed.scheme() != "https" {
        return Err(AppError::BadRequest("卡片链接需为 HTTPS 地址或站内路径".into()));
    }
    Ok(parsed.to_string())
}

fn first_card_image(public_origin: &str, html: &str) -> Option<String> {
    let image = html.find("<img").map(|index| &html[index..])?;
    let source = image.find("src=\"").map(|index| &image[index + 5..])?;
    let source = source.find('"').map(|index| &source[..index])?.trim();
    if source.starts_with('/') && !source.starts_with("//") {
        return Some(format!("{public_origin}{source}"));
    }
    let parsed = reqwest::Url::parse(source).ok()?;
    (parsed.scheme() == "https").then_some(parsed.to_string())
}

fn status_json(status: StatusCode, value: serde_json::Value) -> Response {
    (status, [(header::CACHE_CONTROL, "no-store")], Json(value)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_message_accepts_supported_commands() {
        assert_eq!(parse_verification_message("绑定 ABCD-2345").as_deref(), Some("ABCD2345"));
        assert_eq!(parse_verification_message("验证 abcd2345").as_deref(), Some("ABCD2345"));
        assert!(parse_verification_message("随便聊聊").is_none());
    }

    #[test]
    fn access_token_comparison_is_constant_length() {
        assert!(constant_secret_eq("same-token", "same-token"));
        assert!(!constant_secret_eq("same-token", "other-token"));
    }

    #[test]
    fn card_links_accept_https_and_same_site_paths() {
        assert_eq!(
            normalize_card_url("https://rettheory.top", "/posts/news").unwrap(),
            "https://rettheory.top/posts/news"
        );
        assert!(normalize_card_url("https://rettheory.top", "http://example.com").is_err());
        assert_eq!(
            first_card_image("https://rettheory.top", "<p>通知</p><img src=\"/api/files/card.png\">").as_deref(),
            Some("https://rettheory.top/api/files/card.png")
        );
    }
}
