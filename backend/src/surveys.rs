use ammonia::Builder as HtmlSanitizer;
use axum::{
    Json,
    body::{Body, to_bytes},
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    AppError, AppState, content_disposition, hash_value, now_ms, require_admin, users,
    verify_origin,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChoiceItem {
    id: String,
    label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuestionLogic {
    source_question_id: String,
    #[serde(default)]
    option_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    option_id: Option<String>,
}

impl QuestionLogic {
    fn selected_option_ids(&self) -> Vec<&str> {
        if self.option_ids.is_empty() {
            self.option_id.as_deref().into_iter().collect()
        } else {
            self.option_ids.iter().map(String::as_str).collect()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum SurveyQuestion {
    #[serde(rename = "single")]
    Single {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        options: Vec<ChoiceItem>,
        #[serde(rename = "allowOther", default)]
        allow_other: bool,
        #[serde(rename = "otherRequired", default)]
        other_required: bool,
        #[serde(rename = "correctOptionIds", default)]
        correct_option_ids: Vec<String>,
    },
    #[serde(rename = "multiple")]
    Multiple {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        options: Vec<ChoiceItem>,
        #[serde(rename = "allowOther", default)]
        allow_other: bool,
        #[serde(rename = "otherRequired", default)]
        other_required: bool,
        #[serde(rename = "correctOptionIds", default)]
        correct_option_ids: Vec<String>,
    },
    #[serde(rename = "matrix_single")]
    MatrixSingle {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        rows: Vec<ChoiceItem>,
        columns: Vec<ChoiceItem>,
    },
    #[serde(rename = "matrix_multiple")]
    MatrixMultiple {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        rows: Vec<ChoiceItem>,
        columns: Vec<ChoiceItem>,
    },
    #[serde(rename = "short_text")]
    ShortText {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        #[serde(rename = "maxLength")]
        max_length: usize,
        #[serde(rename = "textType")]
        text_type: String,
        #[serde(rename = "fixedDigits", default = "one")]
        fixed_digits: usize,
        #[serde(rename = "correctAnswer", default)]
        correct_answer: String,
        #[serde(rename = "scoringMode", default = "default_scoring_mode")]
        scoring_mode: String,
    },
    #[serde(rename = "personal_info")]
    PersonalInfo {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        #[serde(rename = "infoType")]
        info_type: String,
        #[serde(rename = "maxLength")]
        max_length: usize,
    },
    #[serde(rename = "heading")]
    Heading {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        #[serde(default)]
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
    },
    #[serde(rename = "file")]
    File {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        #[serde(default)]
        logic: Option<QuestionLogic>,
        #[serde(default)]
        points: i64,
        #[serde(rename = "maxSizeMb")]
        max_size_mb: usize,
    },
}

impl SurveyQuestion {
    fn id(&self) -> &str {
        match self {
            Self::Single { id, .. }
            | Self::Multiple { id, .. }
            | Self::MatrixSingle { id, .. }
            | Self::MatrixMultiple { id, .. }
            | Self::ShortText { id, .. }
            | Self::PersonalInfo { id, .. }
            | Self::Heading { id, .. }
            | Self::File { id, .. } => id,
        }
    }

    fn title(&self) -> &str {
        match self {
            Self::Single { title, .. }
            | Self::Multiple { title, .. }
            | Self::MatrixSingle { title, .. }
            | Self::MatrixMultiple { title, .. }
            | Self::ShortText { title, .. }
            | Self::PersonalInfo { title, .. }
            | Self::Heading { title, .. }
            | Self::File { title, .. } => title,
        }
    }

    fn logic(&self) -> Option<&QuestionLogic> {
        match self {
            Self::Single { logic, .. }
            | Self::Multiple { logic, .. }
            | Self::MatrixSingle { logic, .. }
            | Self::MatrixMultiple { logic, .. }
            | Self::ShortText { logic, .. }
            | Self::PersonalInfo { logic, .. }
            | Self::Heading { logic, .. }
            | Self::File { logic, .. } => logic.as_ref(),
        }
    }

    fn points(&self) -> i64 {
        match self {
            Self::Single { points, .. }
            | Self::Multiple { points, .. }
            | Self::MatrixSingle { points, .. }
            | Self::MatrixMultiple { points, .. }
            | Self::ShortText { points, .. }
            | Self::PersonalInfo { points, .. }
            | Self::Heading { points, .. }
            | Self::File { points, .. } => *points,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SurveyInput {
    slug: String,
    title: String,
    #[serde(default)]
    description: String,
    status: String,
    #[serde(default = "default_access")]
    access: String,
    #[serde(default = "default_kind")]
    kind: String,
    #[serde(default)]
    query_enabled: bool,
    #[serde(default)]
    duration_minutes: i64,
    #[serde(default)]
    exam_instructions: String,
    #[serde(default)]
    exam_start_at: i64,
    #[serde(default)]
    query_identity_question_id: String,
    ip_limit: i64,
    #[serde(default = "default_submit_label")]
    submit_label: String,
    #[serde(default = "default_success_mode")]
    success_mode: String,
    #[serde(default = "default_success_content")]
    success_content: String,
    #[serde(default)]
    success_redirect_url: String,
    questions: Vec<SurveyQuestion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubmissionInput {
    answers: Value,
    #[serde(default)]
    attempt_id: String,
    #[serde(default)]
    timed_out: bool,
}

#[derive(Deserialize)]
pub(crate) struct QueryInput {
    identity: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedbackModule {
    id: String,
    title: String,
    content: String,
    tone: String,
    #[serde(default = "default_feedback_background")]
    background_color: String,
}

#[derive(Deserialize, Serialize)]
pub(crate) struct FeedbackInput {
    title: String,
    modules: Vec<FeedbackModule>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchScoreUpdate {
    response_id: String,
    scores: std::collections::HashMap<String, i64>,
}

#[derive(Deserialize)]
pub(crate) struct BatchScoreInput {
    updates: Vec<BatchScoreUpdate>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileUploadInit {
    question_id: String,
    name: String,
    size: i64,
    #[serde(rename = "type")]
    content_type: String,
}

#[derive(FromRow)]
struct SurveyRecord {
    id: String,
    slug: String,
    title: String,
    description: String,
    status: String,
    access: String,
    kind: String,
    query_enabled: i64,
    duration_minutes: i64,
    exam_instructions: String,
    exam_start_at: i64,
    query_identity_question_id: String,
    ip_limit: i64,
    submit_label: String,
    success_mode: String,
    success_content: String,
    success_redirect_url: String,
    questions_json: String,
    created_at: i64,
    updated_at: i64,
    response_count: i64,
}

#[derive(FromRow)]
struct ResponseRecord {
    id: String,
    answers_json: String,
    score: Option<i64>,
    max_score: Option<i64>,
    feedback_json: Option<String>,
    feedback_updated_at: Option<i64>,
    manual_scores_json: String,
    created_at: i64,
}

const SURVEY_SELECT: &str = "SELECT s.id, s.slug, s.title, s.description, s.status, s.access, s.kind, s.query_enabled, s.duration_minutes, s.exam_instructions, s.exam_start_at, s.query_identity_question_id, s.ip_limit, s.submit_label, s.success_mode, s.success_content, s.success_redirect_url, s.questions_json, s.created_at, s.updated_at, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count FROM surveys s";

pub(crate) async fn list_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &headers).await?;
    let rows =
        sqlx::query_as::<_, SurveyRecord>(&format!("{SURVEY_SELECT} ORDER BY s.updated_at DESC"))
            .fetch_all(&state.db)
            .await?;
    Ok(Json(
        json!({ "surveys": rows.iter().map(survey_json).collect::<Result<Vec<_>, _>>()? }),
    ))
}

pub(crate) async fn create_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut input): Json<SurveyInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    validate_survey(&mut input)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ms();
    let questions = serde_json::to_string(&input.questions).map_err(|_| AppError::Internal)?;
    let result = sqlx::query("INSERT INTO surveys (id, slug, title, description, status, access, kind, query_enabled, duration_minutes, exam_instructions, exam_start_at, query_identity_question_id, ip_limit, submit_label, success_mode, success_content, success_redirect_url, questions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&input.slug).bind(&input.title).bind(&input.description).bind(&input.status)
        .bind(&input.access).bind(&input.kind).bind(input.query_enabled).bind(input.duration_minutes).bind(&input.exam_instructions).bind(input.exam_start_at).bind(&input.query_identity_question_id).bind(input.ip_limit).bind(&input.submit_label).bind(&input.success_mode)
        .bind(&input.success_content).bind(&input.success_redirect_url).bind(questions).bind(now).bind(now).execute(&state.db).await;
    if let Err(error) = result {
        if error.to_string().to_ascii_lowercase().contains("unique") {
            return Err(AppError::BadRequest("公开地址已被使用".into()));
        }
        return Err(error.into());
    }
    let row = find_survey(&state, "id", &id)
        .await?
        .ok_or(AppError::Internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "survey": survey_json(&row)? })),
    ))
}

pub(crate) async fn update_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(mut input): Json<SurveyInput>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    validate_survey(&mut input)?;
    let questions = serde_json::to_string(&input.questions).map_err(|_| AppError::Internal)?;
    let result = sqlx::query("UPDATE surveys SET slug = ?, title = ?, description = ?, status = ?, access = ?, kind = ?, query_enabled = ?, duration_minutes = ?, exam_instructions = ?, exam_start_at = ?, query_identity_question_id = ?, ip_limit = ?, submit_label = ?, success_mode = ?, success_content = ?, success_redirect_url = ?, questions_json = ?, updated_at = ? WHERE id = ?")
        .bind(&input.slug).bind(&input.title).bind(&input.description).bind(&input.status)
        .bind(&input.access).bind(&input.kind).bind(input.query_enabled).bind(input.duration_minutes).bind(&input.exam_instructions).bind(input.exam_start_at).bind(&input.query_identity_question_id).bind(input.ip_limit).bind(&input.submit_label).bind(&input.success_mode)
        .bind(&input.success_content).bind(&input.success_redirect_url).bind(questions).bind(now_ms()).bind(&id).execute(&state.db).await;
    let result = match result {
        Ok(result) => result,
        Err(error) if error.to_string().to_ascii_lowercase().contains("unique") => {
            return Err(AppError::BadRequest("公开地址已被使用".into()));
        }
        Err(error) => return Err(error.into()),
    };
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("问卷不存在"));
    }
    let row = find_survey(&state, "id", &id)
        .await?
        .ok_or(AppError::NotFound("问卷不存在"))?;
    Ok(Json(json!({ "survey": survey_json(&row)? })))
}

pub(crate) async fn delete_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let paths = sqlx::query_scalar::<_, String>(
        "SELECT disk_path FROM survey_file_uploads WHERE survey_id = ? AND disk_path IS NOT NULL",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await?;
    let mut transaction = state.db.begin().await?;
    sqlx::query("DELETE FROM uploads WHERE key IN (SELECT key FROM survey_file_uploads WHERE survey_id = ?)").bind(&id).execute(&mut *transaction).await?;
    sqlx::query("DELETE FROM survey_file_uploads WHERE survey_id = ?")
        .bind(&id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM survey_responses WHERE survey_id = ?")
        .bind(&id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM survey_attempts WHERE survey_id = ?")
        .bind(&id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM surveys WHERE id = ?")
        .bind(&id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    for path in paths {
        let _ = tokio::fs::remove_file(path).await;
    }
    Ok(Json(json!({ "ok": true })))
}

pub(crate) async fn get_public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, AppError> {
    let row = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| matches!(item.status.as_str(), "published" | "closed"))
        .ok_or(AppError::NotFound("问卷不存在或尚未发布"))?;
    let user = users::optional_user(&state, &headers).await?;
    if row.access == "registered" && user.is_none() {
        return Err(AppError::Unauthorized);
    }
    Ok(Json(
        json!({ "survey": public_survey_json(&row)?, "serverNow": now_ms() }),
    ))
}

pub(crate) async fn start_attempt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let row = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| item.status == "published")
        .ok_or(AppError::NotFound("考试不存在、未发布或已经结束"))?;
    if row.kind != "exam" {
        return Err(AppError::BadRequest("此页面不是考试".into()));
    }
    let user = users::optional_user(&state, &headers).await?;
    if row.access == "registered" && user.is_none() {
        return Err(AppError::Unauthorized);
    }
    let now = now_ms();
    if row.exam_start_at > now {
        return Err(AppError::BadRequest("考试尚未开放".into()));
    }
    let ip_hash = hash_value(&format!("{}:{}", row.id, client_ip(&headers)));
    let actor_key = user
        .as_ref()
        .map(|item| format!("user:{}", item.id))
        .unwrap_or_else(|| format!("ip:{ip_hash}"));
    let active: Option<(String, i64)> = sqlx::query_as("SELECT id, expires_at FROM survey_attempts WHERE survey_id = ? AND actor_key = ? AND submitted_at IS NULL AND expires_at > ? ORDER BY started_at DESC LIMIT 1").bind(&row.id).bind(&actor_key).bind(now).fetch_optional(&state.db).await?;
    let (id, expires_at) = if let Some(active) = active {
        active
    } else {
        let id = Uuid::new_v4().to_string();
        let expires_at = now + row.duration_minutes * 60_000;
        sqlx::query("INSERT INTO survey_attempts (id, survey_id, actor_key, started_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(&id).bind(&row.id).bind(&actor_key).bind(now).bind(expires_at).execute(&state.db).await?;
        (id, expires_at)
    };
    Ok((
        StatusCode::CREATED,
        Json(json!({"attempt":{"id":id,"expiresAt":expires_at},"serverNow":now})),
    ))
}

pub(crate) async fn init_file_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<FileUploadInit>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let survey = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| item.status == "published")
        .ok_or(AppError::NotFound("问卷不存在或未开放"))?;
    if survey.access == "registered" {
        users::require_user(&state, &headers).await?;
    }
    let questions: Vec<SurveyQuestion> =
        serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
    let limit = questions
        .iter()
        .find_map(|question| match question {
            SurveyQuestion::File {
                id, max_size_mb, ..
            } if id == &input.question_id => Some(*max_size_mb as i64 * 1024 * 1024),
            _ => None,
        })
        .ok_or_else(|| AppError::BadRequest("文件题不存在".into()))?;
    if input.size <= 0 || input.size > limit || input.size > 100 * 1024 * 1024 {
        return Err(AppError::PayloadTooLarge);
    }
    let filename: String = input
        .name
        .chars()
        .map(|character| {
            if character.is_control() || "\\/:*?\"<>|".contains(character) {
                '-'
            } else {
                character
            }
        })
        .take(180)
        .collect();
    if filename.is_empty() {
        return Err(AppError::BadRequest("文件名无效".into()));
    }
    let upload_id = Uuid::new_v4().to_string();
    let key = format!("survey-files/{}/{}", survey.id, upload_id);
    let ip_hash = hash_value(&format!("{}:{}", survey.id, client_ip(&headers)));
    let content_type = if input.content_type.trim().is_empty() {
        "application/octet-stream"
    } else {
        input.content_type.trim()
    };
    sqlx::query("INSERT INTO survey_file_uploads (key, survey_id, question_id, filename, content_type, size, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&key).bind(&survey.id).bind(&input.question_id).bind(&filename).bind(content_type).bind(input.size).bind(ip_hash).bind(now_ms()).execute(&state.db).await?;
    Ok((
        StatusCode::CREATED,
        Json(
            json!({"key":key,"name":filename,"size":input.size,"type":content_type,"uploadUrl":format!("/api/surveys/{slug}/files/{upload_id}"),"headers":{"content-type":content_type},"expiresAt":now_ms()+900_000}),
        ),
    ))
}

pub(crate) async fn upload_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((slug, upload_id)): Path<(String, String)>,
    body: Body,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let survey = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| item.status == "published")
        .ok_or(AppError::NotFound("问卷不存在或未开放"))?;
    let key = format!("survey-files/{}/{}", survey.id, upload_id);
    let ip_hash = hash_value(&format!("{}:{}", survey.id, client_ip(&headers)));
    let reservation: Option<(String, String, i64)> = sqlx::query_as("SELECT filename, content_type, size FROM survey_file_uploads WHERE key = ? AND ip_hash = ? AND used_at IS NULL AND created_at > ?")
        .bind(&key).bind(ip_hash).bind(now_ms()-3_600_000).fetch_optional(&state.db).await?;
    let (filename, content_type, expected_size) =
        reservation.ok_or_else(|| AppError::BadRequest("上传任务无效或已过期".into()))?;
    let bytes = to_bytes(body, 100 * 1024 * 1024)
        .await
        .map_err(|_| AppError::PayloadTooLarge)?;
    if bytes.len() as i64 != expected_size {
        return Err(AppError::BadRequest("文件大小与上传任务不一致".into()));
    }
    let object_id = Uuid::new_v4().simple().to_string();
    let disk_path = state.config.upload_dir.join(&object_id);
    tokio::fs::write(&disk_path, &bytes).await?;
    let now = now_ms();
    let mut transaction = state.db.begin().await?;
    sqlx::query("INSERT INTO uploads (key, filename, content_type, size, previewable, disk_path, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)").bind(&key).bind(filename).bind(content_type).bind(expected_size).bind(disk_path.to_string_lossy().as_ref()).bind(now).execute(&mut *transaction).await?;
    sqlx::query("UPDATE survey_file_uploads SET disk_path = ? WHERE key = ?")
        .bind(disk_path.to_string_lossy().as_ref())
        .bind(&key)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(Json(json!({"ok":true})))
}

pub(crate) async fn submit_public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<SubmissionInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let row = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| item.status == "published")
        .ok_or(AppError::NotFound("问卷不存在、未发布或已结束"))?;
    let user = users::optional_user(&state, &headers).await?;
    if row.access == "registered" && user.is_none() {
        return Err(AppError::Unauthorized);
    }
    let questions: Vec<SurveyQuestion> =
        serde_json::from_str(&row.questions_json).map_err(|_| AppError::Internal)?;
    let ip = client_ip(&headers);
    let ip_hash = hash_value(&format!("{}:{ip}", row.id));
    let now = now_ms();
    let actor_key = user
        .as_ref()
        .map(|item| format!("user:{}", item.id))
        .unwrap_or_else(|| format!("ip:{ip_hash}"));
    let timed_out = if row.kind == "exam" {
        let attempt: Option<(i64, Option<i64>)> = sqlx::query_as("SELECT expires_at, submitted_at FROM survey_attempts WHERE id = ? AND survey_id = ? AND actor_key = ? LIMIT 1").bind(&input.attempt_id).bind(&row.id).bind(&actor_key).fetch_optional(&state.db).await?;
        let (expires_at, submitted_at) =
            attempt.ok_or_else(|| AppError::BadRequest("考试作答凭证无效".into()))?;
        if submitted_at.is_some() {
            return Err(AppError::BadRequest("考试已经提交".into()));
        }
        let actual_timeout = input.timed_out && now >= expires_at;
        if input.timed_out && !actual_timeout {
            return Err(AppError::BadRequest("考试尚未到交卷时间".into()));
        }
        if !actual_timeout && now > expires_at {
            return Err(AppError::BadRequest(
                "考试时间已结束，请等待自动交卷".into(),
            ));
        }
        if now > expires_at + 300_000 {
            return Err(AppError::BadRequest("考试已超时，答卷无法提交".into()));
        }
        actual_timeout
    } else {
        false
    };
    let answers = validate_answers(&questions, &input.answers, timed_out)?;
    let serialized = serde_json::to_string(&answers).map_err(|_| AppError::Internal)?;
    if serialized.len() > 100_000 {
        return Err(AppError::PayloadTooLarge);
    }
    let id = Uuid::new_v4().to_string();
    let file_keys: Vec<String> = questions
        .iter()
        .filter_map(|question| match question {
            SurveyQuestion::File { id, .. } => answers
                .get(id)
                .and_then(|value| value.get("key"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            _ => None,
        })
        .collect();
    for key in &file_keys {
        let valid: Option<i64> = sqlx::query_scalar("SELECT 1 FROM survey_file_uploads WHERE key = ? AND survey_id = ? AND ip_hash = ? AND disk_path IS NOT NULL AND used_at IS NULL AND created_at > ?").bind(key).bind(&row.id).bind(&ip_hash).bind(now_ms()-3_600_000).fetch_optional(&state.db).await?;
        if valid.is_none() {
            return Err(AppError::BadRequest("文件上传记录无效或未完成".into()));
        }
    }
    let (score, max_score, _manual_pending) = if row.kind == "exam" {
        score_answers(&questions, answers.as_object().unwrap())
    } else {
        (0, 0, false)
    };
    let lookup_hash = if row.query_enabled != 0 && row.access == "public" {
        answers
            .get(&row.query_identity_question_id)
            .and_then(Value::as_str)
            .map(|value| hash_value(&format!("{}:lookup:{}", row.id, normalize_lookup(value))))
    } else {
        None
    };
    let mut transaction = state.db.begin().await?;
    let result = sqlx::query("INSERT INTO survey_responses (id, survey_id, ip_hash, user_id, lookup_hash, answers_json, score, max_score, attempt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&row.id).bind(&ip_hash).bind(user.as_ref().map(|item| item.id.as_str())).bind(lookup_hash).bind(serialized)
        .bind((row.kind == "exam").then_some(score)).bind((row.kind == "exam").then_some(max_score)).bind((row.kind == "exam").then_some(input.attempt_id.as_str())).bind(now).execute(&mut *transaction).await;
    if let Err(error) = result {
        if error.to_string().contains("survey_ip_limit") {
            return Err(AppError::SurveyLimit(format!(
                "此 IP 最多可提交 {} 次",
                row.ip_limit
            )));
        }
        if error.to_string().contains("survey_responses.attempt_id")
            || error.to_string().contains("idx_survey_responses_attempt")
        {
            return Err(AppError::Conflict("考试已经提交，请勿重复交卷"));
        }
        return Err(error.into());
    }
    for key in file_keys {
        sqlx::query("UPDATE survey_file_uploads SET used_at = ?, response_id = ? WHERE key = ? AND used_at IS NULL").bind(now).bind(&id).bind(key).execute(&mut *transaction).await?;
    }
    if row.kind == "exam" {
        sqlx::query(
            "UPDATE survey_attempts SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL",
        )
        .bind(now)
        .bind(&input.attempt_id)
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await?;
    let mut completion = if row.success_mode == "redirect" {
        json!({ "mode": "redirect", "redirectUrl": row.success_redirect_url })
    } else {
        json!({ "mode": "message", "content": row.success_content })
    };
    if let Value::Object(object) = &mut completion
        && row.query_enabled != 0
    {
        object.insert(
            "queryUrl".into(),
            json!(format!("/surveys/{}/query", row.slug)),
        );
    }
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "responseId": id, "completion": completion })),
    ))
}

pub(crate) async fn report_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    require_admin(&state, &headers).await?;
    let survey = find_survey(&state, "id", &id)
        .await?
        .ok_or(AppError::NotFound("问卷不存在"))?;
    let questions: Vec<SurveyQuestion> =
        serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
    let rows = sqlx::query_as::<_, ResponseRecord>("SELECT id, answers_json, score, max_score, feedback_json, feedback_updated_at, manual_scores_json, created_at FROM survey_responses WHERE survey_id = ? ORDER BY created_at ASC")
        .bind(&id).fetch_all(&state.db).await?;
    let csv = build_csv(&questions, &rows)?;
    let filename = safe_filename(&format!("{}-答卷.csv", survey.title));
    let mut response = Response::new(Body::from(format!("\u{feff}{csv}")));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&content_disposition(&filename, false))
            .map_err(|_| AppError::Internal)?,
    );
    Ok(response)
}

pub(crate) async fn results_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &headers).await?;
    let survey = find_survey(&state, "id", &id)
        .await?
        .ok_or(AppError::NotFound("问卷不存在"))?;
    let questions: Vec<SurveyQuestion> =
        serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
    let rows = sqlx::query_as::<_, ResponseRecord>("SELECT id, answers_json, score, max_score, feedback_json, feedback_updated_at, manual_scores_json, created_at FROM survey_responses WHERE survey_id = ? ORDER BY created_at DESC LIMIT 5000").bind(&id).fetch_all(&state.db).await?;
    let responses: Vec<Value> = rows.iter().map(|row| {
        let answers = serde_json::from_str::<Value>(&row.answers_json).map_err(|_| AppError::Internal)?;
        let manual_scores = serde_json::from_str::<std::collections::HashMap<String, i64>>(&row.manual_scores_json).unwrap_or_default();
        let (score, max_score, manual_pending) = if survey.kind == "exam" { apply_manual_scores(&questions, answers.as_object().ok_or(AppError::Internal)?, &manual_scores) } else { (0, 0, false) };
        Ok(json!({"id":row.id,"answers":answers,"score":(survey.kind == "exam").then_some(score),"maxScore":(survey.kind == "exam").then_some(max_score),"manualScores":manual_scores,"manualPending":manual_pending,"feedback":row.feedback_json.as_ref().map(|value| serde_json::from_str::<Value>(value)).transpose().map_err(|_| AppError::Internal)?.map(|mut value| { value["updatedAt"]=json!(row.feedback_updated_at); value }),"createdAt":row.created_at}))
    }).collect::<Result<_,AppError>>()?;
    let mut final_scores = responses
        .iter()
        .filter(|item| item.get("manualPending").and_then(Value::as_bool) == Some(false))
        .filter_map(|item| item.get("score").and_then(Value::as_i64))
        .collect::<Vec<_>>();
    final_scores.sort_unstable();
    let statistics = if survey.kind == "exam" {
        let average = (!final_scores.is_empty())
            .then(|| final_scores.iter().sum::<i64>() as f64 / final_scores.len() as f64);
        let median = if final_scores.is_empty() {
            None
        } else if final_scores.len() % 2 == 1 {
            Some(final_scores[final_scores.len() / 2] as f64)
        } else {
            Some(
                (final_scores[final_scores.len() / 2 - 1] + final_scores[final_scores.len() / 2])
                    as f64
                    / 2.0,
            )
        };
        json!({"average":average,"median":median,"highest":final_scores.last(),"graded":final_scores.len(),"total":responses.len()})
    } else {
        Value::Null
    };
    Ok(Json(
        json!({"survey":survey_json(&survey)?,"reports":build_question_reports(&questions,&responses),"responses":responses.into_iter().take(100).collect::<Vec<_>>(),"total":rows.len(),"page":1,"pageSize":100,"truncated":survey.response_count>5000,"statistics":statistics}),
    ))
}

fn query_result(row: &ResponseRecord, is_exam: bool) -> Result<Value, AppError> {
    let feedback = if let Some(raw) = &row.feedback_json {
        let mut value: Value = serde_json::from_str(raw).map_err(|_| AppError::Internal)?;
        value["updatedAt"] = json!(row.feedback_updated_at);
        value
    } else {
        json!({"status":"pending","title":"等待管理员反馈","modules":[],"updatedAt":null})
    };
    let ready = feedback.get("status").and_then(Value::as_str) == Some("ready");
    Ok(
        json!({"id":row.id,"createdAt":row.created_at,"score":if is_exam && ready { row.score } else { None },"maxScore":if is_exam && ready { row.max_score } else { None },"feedback":feedback}),
    )
}

pub(crate) async fn get_public_query(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, AppError> {
    let survey = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| {
            item.query_enabled != 0 && matches!(item.status.as_str(), "published" | "closed")
        })
        .ok_or(AppError::NotFound("此问卷未开启结果查询"))?;
    if survey.access == "public" {
        let questions: Vec<SurveyQuestion> =
            serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
        let identity_label = questions
            .iter()
            .find(|item| item.id() == survey.query_identity_question_id)
            .map(SurveyQuestion::title)
            .unwrap_or("查询凭证");
        return Ok(Json(
            json!({"survey":{"title":survey.title,"access":"public","identityLabel":identity_label}}),
        ));
    }
    let user = users::require_user(&state, &headers).await?;
    let rows = sqlx::query_as::<_, ResponseRecord>("SELECT id, answers_json, score, max_score, feedback_json, feedback_updated_at, manual_scores_json, created_at FROM survey_responses WHERE survey_id = ? AND user_id = ? ORDER BY created_at DESC").bind(&survey.id).bind(&user.id).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"survey":{"title":survey.title,"access":"registered"},"results":rows.iter().map(|row| query_result(row, survey.kind == "exam")).collect::<Result<Vec<_>,_>>()?}),
    ))
}

pub(crate) async fn post_public_query(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<QueryInput>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    let survey = find_survey(&state, "slug", &slug)
        .await?
        .filter(|item| {
            item.query_enabled != 0 && matches!(item.status.as_str(), "published" | "closed")
        })
        .ok_or(AppError::NotFound("此问卷未开启结果查询"))?;
    if survey.access != "public" {
        return Err(AppError::BadRequest("此问卷需登录后查询".into()));
    }
    let identity = normalize_lookup(&input.identity);
    if identity.is_empty() {
        return Err(AppError::BadRequest("请输入查询凭证".into()));
    }
    let lookup_hash = hash_value(&format!("{}:lookup:{identity}", survey.id));
    let now = now_ms();
    let ip_hash = hash_value(&format!("{}:query-ip:{}", survey.id, client_ip(&headers)));
    let recent_ip: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM survey_query_attempts WHERE survey_id = ? AND ip_hash = ? AND created_at > ?").bind(&survey.id).bind(&ip_hash).bind(now - 600_000).fetch_one(&state.db).await?;
    let repeated_failure: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM survey_query_attempts WHERE survey_id = ? AND lookup_hash = ? AND success = 0 AND created_at > ?").bind(&survey.id).bind(&lookup_hash).bind(now - 1_800_000).fetch_one(&state.db).await?;
    if recent_ip >= 20 || repeated_failure >= 5 {
        return Err(AppError::RateLimited(600));
    }
    let rows = sqlx::query_as::<_, ResponseRecord>("SELECT id, answers_json, score, max_score, feedback_json, feedback_updated_at, manual_scores_json, created_at FROM survey_responses WHERE survey_id = ? AND lookup_hash = ? ORDER BY created_at DESC").bind(&survey.id).bind(lookup_hash).fetch_all(&state.db).await?;
    sqlx::query("INSERT INTO survey_query_attempts (id, survey_id, ip_hash, lookup_hash, success, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(Uuid::new_v4().to_string()).bind(&survey.id).bind(ip_hash).bind(hash_value(&format!("{}:lookup:{identity}", survey.id))).bind(if rows.is_empty() { 0_i64 } else { 1_i64 }).bind(now).execute(&state.db).await?;
    Ok(Json(
        json!({"survey":{"title":survey.title,"access":"public"},"results":rows.iter().map(|row| query_result(row, survey.kind == "exam")).collect::<Result<Vec<_>,_>>()?}),
    ))
}

pub(crate) async fn update_feedback_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, response_id)): Path<(String, String)>,
    Json(mut input): Json<FeedbackInput>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    input.title = input.title.trim().chars().take(120).collect();
    if input.title.is_empty() {
        input.title = "查询结果".into();
    }
    if !(1..=20).contains(&input.modules.len()) {
        return Err(AppError::BadRequest("反馈需包含 1–20 个模块".into()));
    }
    for module in &mut input.modules {
        module.id = module.id.trim().chars().take(80).collect();
        module.title = module.title.trim().chars().take(120).collect();
        module.content = module.content.trim().chars().take(5000).collect();
        if module.id.is_empty() {
            module.id = Uuid::new_v4().to_string();
        }
        if module.title.is_empty() || module.content.is_empty() {
            return Err(AppError::BadRequest("请完善反馈模块".into()));
        }
        if !matches!(module.tone.as_str(), "neutral" | "positive" | "warning") {
            module.tone = "neutral".into();
        }
        module.background_color = module.background_color.trim().to_owned();
        if module.background_color.len() != 7
            || !module.background_color.starts_with('#')
            || !module.background_color[1..]
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(AppError::BadRequest("反馈卡片底色无效".into()));
        }
    }
    let now = now_ms();
    let feedback = json!({"status":"ready","title":input.title,"modules":input.modules});
    let result = sqlx::query("UPDATE survey_responses SET feedback_json = ?, feedback_updated_at = ? WHERE id = ? AND survey_id = ?").bind(feedback.to_string()).bind(now).bind(response_id).bind(id).execute(&state.db).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("答卷不存在"));
    }
    let mut response = feedback;
    response["updatedAt"] = json!(now);
    Ok(Json(json!({"feedback":response})))
}

pub(crate) async fn batch_score_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<BatchScoreInput>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    if !(1..=100).contains(&input.updates.len()) {
        return Err(AppError::BadRequest("请提交 1–100 份人工评分".into()));
    }
    let survey = find_survey(&state, "id", &id)
        .await?
        .ok_or(AppError::NotFound("问卷不存在"))?;
    if survey.kind != "exam" {
        return Err(AppError::BadRequest("只有考试答卷可以评分".into()));
    }
    let questions: Vec<SurveyQuestion> =
        serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
    let manual_questions = questions
        .iter()
        .filter_map(|question| match question {
            SurveyQuestion::ShortText {
                id,
                title,
                scoring_mode,
                points,
                ..
            } if scoring_mode == "manual" && *points > 0 => Some((id, title, *points)),
            _ => None,
        })
        .collect::<Vec<_>>();
    if manual_questions.is_empty() {
        return Err(AppError::BadRequest("此考试没有人工评分题".into()));
    }
    let mut seen = std::collections::HashSet::new();
    let mut prepared = Vec::with_capacity(input.updates.len());
    for update in input.updates {
        if update.response_id.is_empty() || !seen.insert(update.response_id.clone()) {
            return Err(AppError::BadRequest("批量评分数据无效或重复".into()));
        }
        for (question_id, title, points) in &manual_questions {
            let score = update
                .scores
                .get(*question_id)
                .copied()
                .ok_or_else(|| AppError::BadRequest(format!("“{title}”尚未评分")))?;
            if !(0..=*points).contains(&score) {
                return Err(AppError::BadRequest(format!(
                    "“{title}”评分需为 0–{points} 的整数"
                )));
            }
        }
        let answers_json = sqlx::query_scalar::<_, String>(
            "SELECT answers_json FROM survey_responses WHERE id = ? AND survey_id = ? LIMIT 1",
        )
        .bind(&update.response_id)
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest(format!("答卷 {} 不存在", update.response_id)))?;
        let answers: Value = serde_json::from_str(&answers_json).map_err(|_| AppError::Internal)?;
        let grading = apply_manual_scores(
            &questions,
            answers.as_object().ok_or(AppError::Internal)?,
            &update.scores,
        );
        prepared.push((update, grading));
    }
    let mut transaction = state.db.begin().await?;
    let mut results = Vec::with_capacity(prepared.len());
    for (update, (score, max_score, manual_pending)) in prepared {
        let scores_json = serde_json::to_string(&update.scores).map_err(|_| AppError::Internal)?;
        sqlx::query("UPDATE survey_responses SET manual_scores_json = ?, score = ?, max_score = ? WHERE id = ? AND survey_id = ?")
            .bind(scores_json).bind(score).bind(max_score).bind(&update.response_id).bind(&id).execute(&mut *transaction).await?;
        results.push(json!({"responseId":update.response_id,"scores":update.scores,"score":score,"maxScore":max_score,"manualPending":manual_pending}));
    }
    transaction.commit().await?;
    Ok(Json(json!({"results":results})))
}

fn build_question_reports(questions: &[SurveyQuestion], responses: &[Value]) -> Vec<Value> {
    questions.iter().filter(|question| !matches!(question, SurveyQuestion::Heading { .. })).map(|question| {
        let values: Vec<(&str,&Value)> = responses.iter().filter_map(|response| { let value=response.get("answers")?.get(question.id())?; Some((response.get("id")?.as_str()?,value)) }).collect();
        let mut report = json!({"id":question.id(),"title":question.title(),"type":match question { SurveyQuestion::Single{..}=>"single",SurveyQuestion::Multiple{..}=>"multiple",SurveyQuestion::MatrixSingle{..}=>"matrix_single",SurveyQuestion::MatrixMultiple{..}=>"matrix_multiple",SurveyQuestion::ShortText{..}=>"short_text",SurveyQuestion::PersonalInfo{..}=>"personal_info",SurveyQuestion::Heading{..}=>"heading",SurveyQuestion::File{..}=>"file" },"answered":values.len(),"total":responses.len()});
        match question {
            SurveyQuestion::Single { options, allow_other, .. } | SurveyQuestion::Multiple { options, allow_other, .. } => { let mut choices=options.iter().map(|item|(item.id.clone(),item.label.clone())).collect::<Vec<_>>(); if *allow_other { choices.push(("__other".into(),"其他".into())); } report["options"]=json!(choices.into_iter().map(|(id,label)| { let count=values.iter().filter(|(_,value)| { let selected=value.get("selected"); selected.and_then(Value::as_str)==Some(id.as_str()) || selected.and_then(Value::as_array).is_some_and(|items|items.iter().any(|item|item.as_str()==Some(id.as_str()))) }).count(); json!({"id":id,"label":label,"count":count}) }).collect::<Vec<_>>()); }
            SurveyQuestion::MatrixSingle { rows, columns, .. } | SurveyQuestion::MatrixMultiple { rows, columns, .. } => { report["rows"]=json!(rows.iter().map(|row| json!({"id":row.id,"label":row.label,"options":columns.iter().map(|column| { let count=values.iter().filter(|(_,value)| { let selected=value.get(&row.id); selected.and_then(Value::as_str)==Some(column.id.as_str()) || selected.and_then(Value::as_array).is_some_and(|items|items.iter().any(|item|item.as_str()==Some(column.id.as_str()))) }).count(); json!({"id":column.id,"label":column.label,"count":count}) }).collect::<Vec<_>>() })).collect::<Vec<_>>()); }
            SurveyQuestion::ShortText { .. } | SurveyQuestion::PersonalInfo { .. } => report["textAnswers"]=json!(values.iter().filter_map(|(id,value)|value.as_str().map(|text|json!({"responseId":id,"value":text}))).collect::<Vec<_>>()),
            SurveyQuestion::Heading { .. } => {}
            SurveyQuestion::File { .. } => report["fileAnswers"]=json!(values.iter().map(|(id,value)|json!({"responseId":id,"key":value.get("key"),"name":value.get("name"),"size":value.get("size"),"type":value.get("type")})).collect::<Vec<_>>()),
        }
        report
    }).collect()
}

async fn find_survey(
    state: &AppState,
    field: &str,
    value: &str,
) -> Result<Option<SurveyRecord>, AppError> {
    let condition = if field == "slug" { "s.slug" } else { "s.id" };
    Ok(
        sqlx::query_as::<_, SurveyRecord>(&format!(
            "{SURVEY_SELECT} WHERE {condition} = ? LIMIT 1"
        ))
        .bind(value)
        .fetch_optional(&state.db)
        .await?,
    )
}

fn survey_json(row: &SurveyRecord) -> Result<Value, AppError> {
    let questions: Value =
        serde_json::from_str(&row.questions_json).map_err(|_| AppError::Internal)?;
    Ok(json!({
        "id": row.id, "slug": row.slug, "title": row.title, "description": row.description,
        "status": row.status, "access": row.access, "kind": if row.kind == "exam" { "exam" } else { "standard" }, "queryEnabled": row.query_enabled != 0, "durationMinutes": row.duration_minutes,
        "examInstructions": row.exam_instructions, "examStartAt": row.exam_start_at,
        "queryIdentityQuestionId": row.query_identity_question_id, "ipLimit": row.ip_limit,
        "submitLabel": row.submit_label, "successMode": row.success_mode,
        "successContent": row.success_content, "successRedirectUrl": row.success_redirect_url, "questions": questions,
        "responseCount": row.response_count, "createdAt": row.created_at, "updatedAt": row.updated_at,
    }))
}

fn public_survey_json(row: &SurveyRecord) -> Result<Value, AppError> {
    let mut value = survey_json(row)?;
    if let Value::Object(object) = &mut value {
        object.remove("responseCount");
        object.remove("successContent");
        object.remove("successRedirectUrl");
        if let Some(Value::Array(questions)) = object.get_mut("questions") {
            for question in questions {
                if let Value::Object(fields) = question {
                    if fields
                        .get("type")
                        .and_then(Value::as_str)
                        .is_some_and(|kind| matches!(kind, "single" | "multiple"))
                    {
                        fields.insert("correctOptionIds".into(), json!([]));
                    }
                    if fields.get("type").and_then(Value::as_str) == Some("short_text") {
                        fields.insert("correctAnswer".into(), json!(""));
                    }
                }
            }
        }
    }
    Ok(value)
}

fn validate_survey(input: &mut SurveyInput) -> Result<(), AppError> {
    input.slug = input.slug.trim().to_ascii_lowercase();
    input.title = input.title.trim().to_owned();
    input.description = input.description.trim().to_owned();
    input.access = input.access.trim().to_owned();
    input.kind = input.kind.trim().to_owned();
    if input.kind == "information_query" {
        input.kind = "standard".into();
        input.query_enabled = true;
    }
    input.query_identity_question_id = input.query_identity_question_id.trim().to_owned();
    if !input.query_enabled || input.access == "registered" {
        input.query_identity_question_id.clear();
    }
    input.submit_label = input.submit_label.trim().to_owned();
    input.success_mode = input.success_mode.trim().to_owned();
    input.success_redirect_url = input.success_redirect_url.trim().to_owned();
    input.success_content = HtmlSanitizer::default()
        .clean(&input.success_content)
        .to_string();
    input.exam_instructions = HtmlSanitizer::default()
        .clean(&input.exam_instructions)
        .to_string();
    let slug_valid = (3..=64).contains(&input.slug.len())
        && input
            .slug
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !input.slug.starts_with('-')
        && !input.slug.ends_with('-');
    if !slug_valid {
        return Err(AppError::BadRequest(
            "公开地址需为 3–64 位小写字母、数字或连字符".into(),
        ));
    }
    if input.title.is_empty() || input.title.chars().count() > 120 {
        return Err(AppError::BadRequest("请填写 1–120 字问卷标题".into()));
    }
    if input.description.chars().count() > 2000 {
        return Err(AppError::BadRequest("问卷说明不能超过 2000 字".into()));
    }
    if !matches!(input.status.as_str(), "draft" | "published" | "closed") {
        return Err(AppError::BadRequest("问卷状态无效".into()));
    }
    if !matches!(input.access.as_str(), "public" | "registered") {
        return Err(AppError::BadRequest("访问权限无效".into()));
    }
    if !matches!(input.kind.as_str(), "standard" | "exam") {
        return Err(AppError::BadRequest("问卷类型无效".into()));
    }
    if input.kind == "exam" && !(1..=1440).contains(&input.duration_minutes) {
        return Err(AppError::BadRequest("考试作答时间需为 1–1440 分钟".into()));
    }
    if input.kind == "exam" && input.exam_instructions.trim().is_empty() {
        return Err(AppError::BadRequest("请填写考试说明".into()));
    }
    if input.exam_start_at < 0 {
        return Err(AppError::BadRequest("考试开放时间无效".into()));
    }
    if input.submit_label.is_empty() || input.submit_label.chars().count() > 40 {
        return Err(AppError::BadRequest("提交按钮文字需为 1–40 字".into()));
    }
    if !matches!(input.success_mode.as_str(), "message" | "redirect") {
        return Err(AppError::BadRequest("提交后动作无效".into()));
    }
    if input.success_content.len() > 100_000
        || input.success_mode == "message" && input.success_content.trim().is_empty()
    {
        return Err(AppError::BadRequest("请填写有效的提交后提示内容".into()));
    }
    if input.success_mode == "redirect" && !safe_redirect(&input.success_redirect_url) {
        return Err(AppError::BadRequest(
            "跳转网址需为站内路径或 HTTPS 网址".into(),
        ));
    }
    if !(1..=1000).contains(&input.ip_limit) {
        return Err(AppError::BadRequest("单 IP 作答次数需为 1–1000".into()));
    }
    if !(1..=200).contains(&input.questions.len()) {
        return Err(AppError::BadRequest("问卷需包含 1–200 道题".into()));
    }
    let mut ids = std::collections::HashSet::new();
    for (index, question) in input.questions.iter().enumerate() {
        if !valid_id(question.id()) || !ids.insert(question.id().to_owned()) {
            return Err(AppError::BadRequest(format!(
                "第 {} 题编号无效或重复",
                index + 1
            )));
        }
        if question.title().trim().is_empty() || question.title().chars().count() > 300 {
            return Err(AppError::BadRequest(format!("请完善第 {} 题", index + 1)));
        }
        if !(0..=1000).contains(&question.points()) {
            return Err(AppError::BadRequest(format!(
                "第 {} 题分数需为 0–1000",
                index + 1
            )));
        }
        if let Some(logic) = question.logic() {
            let logic_option_ids = logic.selected_option_ids();
            let source = input.questions[..index]
                .iter()
                .find(|item| item.id() == logic.source_question_id);
            let valid = !logic_option_ids.is_empty()
                && source.is_some_and(|item| match item {
                    SurveyQuestion::Single {
                        options,
                        allow_other,
                        ..
                    }
                    | SurveyQuestion::Multiple {
                        options,
                        allow_other,
                        ..
                    } => logic_option_ids.iter().all(|logic_option_id| {
                        options.iter().any(|option| option.id == *logic_option_id)
                            || *allow_other && *logic_option_id == "__other"
                    }),
                    _ => false,
                });
            if !valid {
                return Err(AppError::BadRequest(format!(
                    "第 {} 题的显示条件无效",
                    index + 1
                )));
            }
        }
        match question {
            SurveyQuestion::Single {
                options,
                correct_option_ids,
                points,
                ..
            }
            | SurveyQuestion::Multiple {
                options,
                correct_option_ids,
                points,
                ..
            } => {
                validate_items(options, 2, 50, index)?;
                if correct_option_ids
                    .iter()
                    .any(|id| !options.iter().any(|item| item.id == *id))
                    || *points > 0 && correct_option_ids.is_empty()
                {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题正确答案无效",
                        index + 1
                    )));
                }
            }
            SurveyQuestion::MatrixSingle { rows, columns, .. }
            | SurveyQuestion::MatrixMultiple { rows, columns, .. } => {
                validate_items(rows, 1, 50, index)?;
                validate_items(columns, 2, 30, index)?;
            }
            SurveyQuestion::ShortText {
                max_length,
                text_type,
                fixed_digits,
                correct_answer,
                scoring_mode,
                points,
                ..
            } => {
                if !(1..=5000).contains(max_length) {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题字数限制需为 1–5000",
                        index + 1
                    )));
                }
                if !matches!(
                    text_type.as_str(),
                    "text" | "digits_fixed" | "id_card" | "name" | "english"
                ) {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题字段类型无效",
                        index + 1
                    )));
                }
                if text_type == "digits_fixed" && !(1..=64).contains(fixed_digits) {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题固定位数需为 1–64",
                        index + 1
                    )));
                }
                if !matches!(scoring_mode.as_str(), "exact" | "contains" | "manual") {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题评分方式无效",
                        index + 1
                    )));
                }
                if *points > 0 && scoring_mode != "manual" && correct_answer.trim().is_empty() {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题需填写答案字段",
                        index + 1
                    )));
                }
            }
            SurveyQuestion::PersonalInfo {
                info_type,
                max_length,
                ..
            } => {
                if !matches!(
                    info_type.as_str(),
                    "name" | "email" | "phone" | "student_id" | "id_card" | "custom"
                ) || !(1..=500).contains(max_length)
                {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题个人信息设置无效",
                        index + 1
                    )));
                }
            }
            SurveyQuestion::Heading { .. } => {}
            SurveyQuestion::File { max_size_mb, .. } => {
                if !(1..=100).contains(max_size_mb) {
                    return Err(AppError::BadRequest(format!(
                        "第 {} 题文件上限需为 1–100 MB",
                        index + 1
                    )));
                }
            }
        }
    }
    if input.query_enabled && input.access == "public" {
        let identity = input
            .questions
            .iter()
            .find(|item| item.id() == input.query_identity_question_id);
        if !matches!(identity, Some(SurveyQuestion::PersonalInfo { required: true, logic: None, info_type, .. }) if matches!(info_type.as_str(), "email" | "student_id" | "id_card"))
        {
            return Err(AppError::BadRequest(
                "公开结果查询需使用始终显示的必答邮箱、学号/工号或身份证题".into(),
            ));
        }
    }
    Ok(())
}

fn validate_items(
    items: &[ChoiceItem],
    min: usize,
    max: usize,
    question_index: usize,
) -> Result<(), AppError> {
    if !(min..=max).contains(&items.len()) {
        return Err(AppError::BadRequest(format!(
            "第 {} 题选项数量无效",
            question_index + 1
        )));
    }
    let mut ids = std::collections::HashSet::new();
    if items.iter().any(|item| {
        !valid_id(&item.id)
            || !ids.insert(&item.id)
            || item.label.trim().is_empty()
            || item.label.chars().count() > 120
    }) {
        return Err(AppError::BadRequest(format!(
            "第 {} 题选项无效或重复",
            question_index + 1
        )));
    }
    Ok(())
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 80
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn safe_redirect(value: &str) -> bool {
    if value.starts_with('/') && !value.starts_with("//") {
        return true;
    }
    let Some(rest) = value.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.is_empty()
        && !host.chars().any(char::is_whitespace)
        && (host.contains('.') || host == "localhost" || host.starts_with('['))
}

fn default_access() -> String {
    "public".into()
}
fn default_kind() -> String {
    "standard".into()
}
fn default_feedback_background() -> String {
    "#f3f0ff".into()
}
fn default_scoring_mode() -> String {
    "exact".into()
}
fn default_submit_label() -> String {
    "提交答卷".into()
}
fn default_success_mode() -> String {
    "message".into()
}
fn default_success_content() -> String {
    "<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>".into()
}

fn selected_option_ids(value: Option<&Value>) -> Vec<&str> {
    let selected = value
        .and_then(Value::as_object)
        .and_then(|item| item.get("selected"));
    if let Some(value) = selected.and_then(Value::as_str) {
        vec![value]
    } else {
        selected
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default()
    }
}

fn question_visible(
    question: &SurveyQuestion,
    answers: &Map<String, Value>,
    questions: &[SurveyQuestion],
) -> bool {
    question.logic().is_none_or(|logic| {
        let source = questions
            .iter()
            .find(|item| item.id() == logic.source_question_id);
        let selected = selected_option_ids(answers.get(&logic.source_question_id));
        source.is_none_or(|item| question_visible(item, answers, questions))
            && logic
                .selected_option_ids()
                .iter()
                .any(|option_id| selected.contains(option_id))
    })
}

fn validate_answers(
    questions: &[SurveyQuestion],
    raw: &Value,
    allow_incomplete: bool,
) -> Result<Value, AppError> {
    let input = raw
        .as_object()
        .ok_or_else(|| AppError::BadRequest("答卷内容无效".into()))?;
    let mut answers = Map::new();
    for (index, question) in questions.iter().enumerate() {
        if !question_visible(question, input, questions)
            || matches!(question, SurveyQuestion::Heading { .. })
        {
            continue;
        }
        let value = input.get(question.id()).unwrap_or(&Value::Null);
        let prefix = format!("第 {} 题", index + 1);
        match question {
            SurveyQuestion::Single {
                id,
                required,
                options,
                allow_other,
                other_required,
                ..
            } => {
                let object = value.as_object();
                let selected = object
                    .and_then(|item| item.get("selected"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                let other = object
                    .and_then(|item| item.get("otherText"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if selected.is_empty() {
                    if *required && !allow_incomplete {
                        return Err(AppError::BadRequest(format!("{prefix}为必答题")));
                    }
                    continue;
                }
                if selected == "__other" {
                    if !*allow_other {
                        return Err(AppError::BadRequest(format!("{prefix}不允许其他选项")));
                    }
                    if *other_required && other.is_empty() {
                        return Err(AppError::BadRequest(format!("{prefix}请填写其他选项")));
                    }
                } else if !options.iter().any(|item| item.id == selected) {
                    return Err(AppError::BadRequest(format!("{prefix}选项无效")));
                }
                answers.insert(id.clone(), json!({ "selected": selected, "otherText": if selected == "__other" { other } else { "" } }));
            }
            SurveyQuestion::Multiple {
                id,
                required,
                options,
                allow_other,
                other_required,
                ..
            } => {
                let object = value.as_object();
                let selected: Vec<&str> = object
                    .and_then(|item| item.get("selected"))
                    .and_then(Value::as_array)
                    .map(|items| items.iter().filter_map(Value::as_str).collect())
                    .unwrap_or_default();
                if selected.is_empty() {
                    if *required && !allow_incomplete {
                        return Err(AppError::BadRequest(format!("{prefix}为必答题")));
                    }
                    continue;
                }
                if selected.len() > options.len() + usize::from(*allow_other)
                    || selected.iter().any(|choice| {
                        *choice != "__other" && !options.iter().any(|item| item.id == *choice)
                            || *choice == "__other" && !*allow_other
                    })
                {
                    return Err(AppError::BadRequest(format!("{prefix}选项无效")));
                }
                let mut unique = std::collections::HashSet::new();
                if selected.iter().any(|choice| !unique.insert(*choice)) {
                    return Err(AppError::BadRequest(format!("{prefix}选项重复")));
                }
                let other = object
                    .and_then(|item| item.get("otherText"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if selected.contains(&"__other") && *other_required && other.is_empty() {
                    return Err(AppError::BadRequest(format!("{prefix}请填写其他选项")));
                }
                answers.insert(
                    id.clone(),
                    json!({ "selected": selected, "otherText": other }),
                );
            }
            SurveyQuestion::MatrixSingle {
                id,
                required,
                rows,
                columns,
                ..
            } => {
                let object = value.as_object();
                let mut normalized = Map::new();
                for row in rows {
                    let selected = object
                        .and_then(|item| item.get(&row.id))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if selected.is_empty() {
                        if *required && !allow_incomplete {
                            return Err(AppError::BadRequest(format!(
                                "{prefix}的“{}”未作答",
                                row.label
                            )));
                        }
                        continue;
                    }
                    if !columns.iter().any(|column| column.id == selected) {
                        return Err(AppError::BadRequest(format!("{prefix}选项无效")));
                    }
                    normalized.insert(row.id.clone(), json!(selected));
                }
                if object.is_some_and(|item| {
                    item.keys()
                        .any(|key| !rows.iter().any(|row| row.id == *key))
                }) {
                    return Err(AppError::BadRequest(format!("{prefix}矩阵行无效")));
                }
                if !normalized.is_empty() {
                    answers.insert(id.clone(), Value::Object(normalized));
                }
            }
            SurveyQuestion::MatrixMultiple {
                id,
                required,
                rows,
                columns,
                ..
            } => {
                let object = value.as_object();
                let mut normalized = Map::new();
                for row in rows {
                    let selected = object
                        .and_then(|item| item.get(&row.id))
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    if selected.is_empty() {
                        if *required && !allow_incomplete {
                            return Err(AppError::BadRequest(format!(
                                "{prefix}的“{}”未作答",
                                row.label
                            )));
                        }
                        continue;
                    }
                    if selected.iter().any(|choice| {
                        choice
                            .as_str()
                            .is_none_or(|choice| !columns.iter().any(|column| column.id == choice))
                    }) {
                        return Err(AppError::BadRequest(format!("{prefix}选项无效")));
                    }
                    normalized.insert(row.id.clone(), Value::Array(selected));
                }
                if object.is_some_and(|item| {
                    item.keys()
                        .any(|key| !rows.iter().any(|row| row.id == *key))
                }) {
                    return Err(AppError::BadRequest(format!("{prefix}矩阵行无效")));
                }
                if !normalized.is_empty() {
                    answers.insert(id.clone(), Value::Object(normalized));
                }
            }
            SurveyQuestion::ShortText {
                id,
                required,
                max_length,
                text_type,
                fixed_digits,
                ..
            } => {
                let answer = value.as_str().unwrap_or("").trim();
                if answer.is_empty() {
                    if *required && !allow_incomplete {
                        return Err(AppError::BadRequest(format!("{prefix}为必答题")));
                    }
                    continue;
                }
                if answer.chars().count() > *max_length {
                    return Err(AppError::BadRequest(format!(
                        "{prefix}不能超过 {max_length} 字"
                    )));
                }
                let valid = match text_type.as_str() {
                    "digits_fixed" => {
                        answer.len() == *fixed_digits
                            && answer.bytes().all(|byte| byte.is_ascii_digit())
                    }
                    "id_card" => valid_id_card(answer),
                    "name" => {
                        (2..=50).contains(&answer.chars().count())
                            && answer.chars().all(|character| {
                                character.is_ascii_alphabetic()
                                    || ('\u{4e00}'..='\u{9fff}').contains(&character)
                                    || matches!(character, '·' | '.' | ' ')
                            })
                    }
                    "english" => {
                        answer
                            .chars()
                            .next()
                            .is_some_and(|character| character.is_ascii_alphabetic())
                            && answer.chars().all(|character| {
                                character.is_ascii_alphabetic()
                                    || matches!(character, ' ' | '.' | '\'' | '-')
                            })
                    }
                    _ => true,
                };
                if !valid {
                    return Err(AppError::BadRequest(format!("{prefix}格式无效")));
                }
                answers.insert(id.clone(), json!(answer));
            }
            SurveyQuestion::PersonalInfo {
                id,
                required,
                info_type,
                max_length,
                ..
            } => {
                let answer = value.as_str().unwrap_or("").trim();
                if answer.is_empty() {
                    if *required && !allow_incomplete {
                        return Err(AppError::BadRequest(format!("{prefix}为必答题")));
                    }
                    continue;
                }
                if answer.chars().count() > *max_length {
                    return Err(AppError::BadRequest(format!(
                        "{prefix}不能超过 {max_length} 字"
                    )));
                }
                let valid = match info_type.as_str() {
                    "email" => {
                        answer.contains('@')
                            && answer
                                .split('@')
                                .nth(1)
                                .is_some_and(|part| part.contains('.'))
                    }
                    "phone" => {
                        (6..=24).contains(&answer.len())
                            && answer.chars().all(|value| {
                                value.is_ascii_digit() || matches!(value, '+' | '-' | ' ')
                            })
                    }
                    "student_id" => {
                        (4..=40).contains(&answer.len())
                            && answer.bytes().all(|value| {
                                value.is_ascii_alphanumeric() || matches!(value, b'_' | b'-')
                            })
                    }
                    "id_card" => valid_id_card(answer),
                    "name" => (2..=50).contains(&answer.chars().count()),
                    "custom" => true,
                    _ => false,
                };
                if !valid {
                    return Err(AppError::BadRequest(format!("{prefix}格式无效")));
                }
                answers.insert(id.clone(), json!(answer));
            }
            SurveyQuestion::Heading { .. } => {}
            SurveyQuestion::File {
                id,
                required,
                max_size_mb,
                ..
            } => {
                if value.is_null() {
                    if *required && !allow_incomplete {
                        return Err(AppError::BadRequest(format!("{prefix}为必答题")));
                    }
                    continue;
                }
                let object = value
                    .as_object()
                    .ok_or_else(|| AppError::BadRequest(format!("{prefix}文件无效")))?;
                let key = object.get("key").and_then(Value::as_str).unwrap_or("");
                let name = object.get("name").and_then(Value::as_str).unwrap_or("");
                let size = object.get("size").and_then(Value::as_i64).unwrap_or(0);
                let content_type = object
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("application/octet-stream");
                if !key.starts_with("survey-files/")
                    || name.is_empty()
                    || size <= 0
                    || size > (*max_size_mb as i64) * 1024 * 1024
                {
                    return Err(AppError::BadRequest(format!("{prefix}文件无效或过大")));
                }
                answers.insert(
                    id.clone(),
                    json!({"key":key,"name":name,"size":size,"type":content_type}),
                );
            }
        }
    }
    Ok(Value::Object(answers))
}

fn normalize_lookup(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn score_answers(questions: &[SurveyQuestion], answers: &Map<String, Value>) -> (i64, i64, bool) {
    let mut score = 0;
    let mut max_score = 0;
    let mut manual_pending = false;
    for question in questions {
        if !question_visible(question, answers, questions) || question.points() <= 0 {
            continue;
        }
        max_score += question.points();
        let correct = match question {
            SurveyQuestion::Single {
                id,
                correct_option_ids,
                ..
            }
            | SurveyQuestion::Multiple {
                id,
                correct_option_ids,
                ..
            } => {
                let mut selected = selected_option_ids(answers.get(id))
                    .into_iter()
                    .map(str::to_owned)
                    .collect::<Vec<_>>();
                let mut expected = correct_option_ids.clone();
                selected.sort();
                expected.sort();
                selected == expected
            }
            SurveyQuestion::ShortText {
                id,
                text_type,
                correct_answer,
                scoring_mode,
                ..
            } => {
                let actual = answers.get(id).and_then(Value::as_str).unwrap_or("").trim();
                if scoring_mode == "manual" {
                    manual_pending = true;
                    false
                } else if scoring_mode == "contains" {
                    if text_type == "english" {
                        actual
                            .to_ascii_lowercase()
                            .contains(&correct_answer.trim().to_ascii_lowercase())
                    } else {
                        actual.contains(correct_answer.trim())
                    }
                } else if text_type == "english" {
                    actual.eq_ignore_ascii_case(correct_answer.trim())
                } else {
                    actual == correct_answer.trim()
                }
            }
            _ => false,
        };
        if correct {
            score += question.points();
        }
    }
    (score, max_score, manual_pending)
}

fn apply_manual_scores(
    questions: &[SurveyQuestion],
    answers: &Map<String, Value>,
    manual_scores: &std::collections::HashMap<String, i64>,
) -> (i64, i64, bool) {
    let (automatic, max_score, _) = score_answers(questions, answers);
    let mut score = automatic;
    let mut manual_pending = false;
    for question in questions {
        if !question_visible(question, answers, questions) {
            continue;
        }
        if let SurveyQuestion::ShortText {
            id,
            scoring_mode,
            points,
            ..
        } = question
            && scoring_mode == "manual"
            && *points > 0
        {
            match manual_scores.get(id) {
                Some(value) if (0..=*points).contains(value) => score += value,
                _ => manual_pending = true,
            }
        }
    }
    (score, max_score, manual_pending)
}

fn valid_id_card(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 18 || !bytes[..17].iter().all(u8::is_ascii_digit) {
        return false;
    }
    if &bytes[..6] == b"000000" {
        return false;
    }
    let number = |range: std::ops::Range<usize>| {
        bytes[range]
            .iter()
            .fold(0usize, |total, byte| total * 10 + (*byte - b'0') as usize)
    };
    let year = number(6..10);
    let month = number(10..12);
    let day = number(12..14);
    let leap = year % 400 == 0 || year % 4 == 0 && year % 100 != 0;
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    if day == 0 || day > days {
        return false;
    }
    let weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let checks = b"10X98765432";
    let sum: usize = value
        .bytes()
        .take(17)
        .zip(weights)
        .map(|(byte, weight)| (byte - b'0') as usize * weight)
        .sum();
    checks[sum % 11] == bytes[17].to_ascii_uppercase()
}

fn client_ip(headers: &HeaderMap) -> &str {
    headers
        .get("cf-connecting-ip")
        .or_else(|| headers.get("x-forwarded-for"))
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
}

fn build_csv(questions: &[SurveyQuestion], rows: &[ResponseRecord]) -> Result<String, AppError> {
    let mut headings = vec!["答卷编号".to_owned(), "提交时间".to_owned()];
    let has_score = rows.iter().any(|row| row.score.is_some());
    if has_score {
        headings.extend(["得分".into(), "满分".into()]);
    }
    for (index, question) in questions.iter().enumerate() {
        match question {
            SurveyQuestion::Heading { .. } => {}
            SurveyQuestion::MatrixSingle { rows, .. }
            | SurveyQuestion::MatrixMultiple { rows, .. } => {
                for row in rows {
                    headings.push(format!(
                        "{}. {} / {}",
                        index + 1,
                        question.title(),
                        row.label
                    ));
                }
            }
            _ => headings.push(format!("{}. {}", index + 1, question.title())),
        }
    }
    let mut lines = vec![
        headings
            .iter()
            .map(|value| csv_cell(value))
            .collect::<Vec<_>>()
            .join(","),
    ];
    for row in rows {
        let answers: Value =
            serde_json::from_str(&row.answers_json).map_err(|_| AppError::Internal)?;
        let mut cells = vec![row.id.clone(), row.created_at.to_string()];
        if has_score {
            cells.push(row.score.map(|value| value.to_string()).unwrap_or_default());
            cells.push(
                row.max_score
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
            );
        }
        for question in questions {
            if matches!(question, SurveyQuestion::Heading { .. }) {
                continue;
            }
            let value = answers.get(question.id()).unwrap_or(&Value::Null);
            match question {
                SurveyQuestion::MatrixSingle { rows, .. }
                | SurveyQuestion::MatrixMultiple { rows, .. } => {
                    for matrix_row in rows {
                        cells.push(display_answer(question, value, Some(&matrix_row.id)));
                    }
                }
                _ => cells.push(display_answer(question, value, None)),
            }
        }
        lines.push(
            cells
                .iter()
                .map(|value| csv_cell(value))
                .collect::<Vec<_>>()
                .join(","),
        );
    }
    Ok(lines.join("\r\n"))
}

fn display_answer(question: &SurveyQuestion, value: &Value, row: Option<&str>) -> String {
    match question {
        SurveyQuestion::ShortText { .. } | SurveyQuestion::PersonalInfo { .. } => {
            value.as_str().unwrap_or("").to_owned()
        }
        SurveyQuestion::Heading { .. } => String::new(),
        SurveyQuestion::File { .. } => value
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        SurveyQuestion::Single { options, .. } | SurveyQuestion::Multiple { options, .. } => {
            let object = value.as_object();
            let selected = object.and_then(|item| item.get("selected"));
            let ids: Vec<&str> = selected
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).collect())
                .or_else(|| selected.and_then(Value::as_str).map(|item| vec![item]))
                .unwrap_or_default();
            let other = object
                .and_then(|item| item.get("otherText"))
                .and_then(Value::as_str)
                .unwrap_or("");
            ids.iter()
                .map(|id| {
                    if *id == "__other" {
                        format!("其他：{other}")
                    } else {
                        options
                            .iter()
                            .find(|item| item.id == *id)
                            .map(|item| item.label.clone())
                            .unwrap_or_else(|| (*id).to_owned())
                    }
                })
                .collect::<Vec<_>>()
                .join("；")
        }
        SurveyQuestion::MatrixSingle { columns, .. }
        | SurveyQuestion::MatrixMultiple { columns, .. } => {
            let selected = row.and_then(|row| value.get(row));
            let ids: Vec<&str> = selected
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).collect())
                .or_else(|| selected.and_then(Value::as_str).map(|item| vec![item]))
                .unwrap_or_default();
            ids.iter()
                .map(|id| {
                    columns
                        .iter()
                        .find(|item| item.id == *id)
                        .map(|item| item.label.clone())
                        .unwrap_or_else(|| (*id).to_owned())
                })
                .collect::<Vec<_>>()
                .join("；")
        }
    }
}

fn csv_cell(value: &str) -> String {
    let safe = if matches!(value.as_bytes().first(), Some(b'=' | b'+' | b'-' | b'@')) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    format!("\"{}\"", safe.replace('"', "\"\""))
}
fn safe_filename(value: &str) -> String {
    let value: String = value
        .chars()
        .map(|character| {
            if character.is_control() || "\\/:*?\"<>|".contains(character) {
                '-'
            } else {
                character
            }
        })
        .take(100)
        .collect();
    if value.trim().is_empty() {
        "survey-report.csv".into()
    } else {
        value
    }
}
fn one() -> usize {
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_chinese_id_checksum() {
        assert!(valid_id_card("11010519491231002X"));
        assert!(!valid_id_card("110105194912310021"));
        assert!(!valid_id_card("000000194912310020"));
        assert!(csv_cell("=1+1").starts_with("\"'="));
    }
}
