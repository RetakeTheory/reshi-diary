use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
};
use ammonia::Builder as HtmlSanitizer;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{AppError, AppState, content_disposition, hash_value, now_ms, require_admin, users, verify_origin};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChoiceItem {
    id: String,
    label: String,
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
        options: Vec<ChoiceItem>,
        #[serde(rename = "allowOther", default)]
        allow_other: bool,
        #[serde(rename = "otherRequired", default)]
        other_required: bool,
    },
    #[serde(rename = "multiple")]
    Multiple {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
        options: Vec<ChoiceItem>,
        #[serde(rename = "allowOther", default)]
        allow_other: bool,
        #[serde(rename = "otherRequired", default)]
        other_required: bool,
    },
    #[serde(rename = "matrix_single")]
    MatrixSingle {
        id: String,
        title: String,
        #[serde(default)]
        description: String,
        required: bool,
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
        #[serde(rename = "maxLength")]
        max_length: usize,
        #[serde(rename = "textType")]
        text_type: String,
        #[serde(rename = "fixedDigits", default = "one")]
        fixed_digits: usize,
    },
}

impl SurveyQuestion {
    fn id(&self) -> &str {
        match self {
            Self::Single { id, .. } | Self::Multiple { id, .. } | Self::MatrixSingle { id, .. }
            | Self::MatrixMultiple { id, .. } | Self::ShortText { id, .. } => id,
        }
    }

    fn title(&self) -> &str {
        match self {
            Self::Single { title, .. } | Self::Multiple { title, .. } | Self::MatrixSingle { title, .. }
            | Self::MatrixMultiple { title, .. } | Self::ShortText { title, .. } => title,
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
pub(crate) struct SubmissionInput {
    answers: Value,
}

#[derive(FromRow)]
struct SurveyRecord {
    id: String,
    slug: String,
    title: String,
    description: String,
    status: String,
    access: String,
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
    created_at: i64,
}

const SURVEY_SELECT: &str = "SELECT s.id, s.slug, s.title, s.description, s.status, s.access, s.ip_limit, s.submit_label, s.success_mode, s.success_content, s.success_redirect_url, s.questions_json, s.created_at, s.updated_at, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id = s.id) AS response_count FROM surveys s";

pub(crate) async fn list_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, AppError> {
    require_admin(&state, &headers).await?;
    let rows = sqlx::query_as::<_, SurveyRecord>(&format!("{SURVEY_SELECT} ORDER BY s.updated_at DESC"))
        .fetch_all(&state.db).await?;
    Ok(Json(json!({ "surveys": rows.iter().map(survey_json).collect::<Result<Vec<_>, _>>()? })))
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
    let result = sqlx::query("INSERT INTO surveys (id, slug, title, description, status, access, ip_limit, submit_label, success_mode, success_content, success_redirect_url, questions_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id).bind(&input.slug).bind(&input.title).bind(&input.description).bind(&input.status)
        .bind(&input.access).bind(input.ip_limit).bind(&input.submit_label).bind(&input.success_mode)
        .bind(&input.success_content).bind(&input.success_redirect_url).bind(questions).bind(now).bind(now).execute(&state.db).await;
    if let Err(error) = result {
        if error.to_string().to_ascii_lowercase().contains("unique") {
            return Err(AppError::BadRequest("公开地址已被使用".into()));
        }
        return Err(error.into());
    }
    let row = find_survey(&state, "id", &id).await?.ok_or(AppError::Internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "survey": survey_json(&row)? }))))
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
    let result = sqlx::query("UPDATE surveys SET slug = ?, title = ?, description = ?, status = ?, access = ?, ip_limit = ?, submit_label = ?, success_mode = ?, success_content = ?, success_redirect_url = ?, questions_json = ?, updated_at = ? WHERE id = ?")
        .bind(&input.slug).bind(&input.title).bind(&input.description).bind(&input.status)
        .bind(&input.access).bind(input.ip_limit).bind(&input.submit_label).bind(&input.success_mode)
        .bind(&input.success_content).bind(&input.success_redirect_url).bind(questions).bind(now_ms()).bind(&id).execute(&state.db).await;
    let result = match result {
        Ok(result) => result,
        Err(error) if error.to_string().to_ascii_lowercase().contains("unique") => return Err(AppError::BadRequest("公开地址已被使用".into())),
        Err(error) => return Err(error.into()),
    };
    if result.rows_affected() == 0 { return Err(AppError::NotFound("问卷不存在")); }
    let row = find_survey(&state, "id", &id).await?.ok_or(AppError::NotFound("问卷不存在"))?;
    Ok(Json(json!({ "survey": public_survey_json(&row)? })))
}

pub(crate) async fn delete_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppError> {
    verify_origin(&state.config, &headers)?;
    require_admin(&state, &headers).await?;
    let mut transaction = state.db.begin().await?;
    sqlx::query("DELETE FROM survey_responses WHERE survey_id = ?").bind(&id).execute(&mut *transaction).await?;
    sqlx::query("DELETE FROM surveys WHERE id = ?").bind(&id).execute(&mut *transaction).await?;
    transaction.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

pub(crate) async fn get_public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, AppError> {
    let row = find_survey(&state, "slug", &slug).await?.filter(|item| matches!(item.status.as_str(), "published" | "closed"))
        .ok_or(AppError::NotFound("问卷不存在或尚未发布"))?;
    if row.access == "registered" && users::optional_user(&state, &headers).await?.is_none() { return Err(AppError::Unauthorized); }
    Ok(Json(json!({ "survey": survey_json(&row)? })))
}

pub(crate) async fn submit_public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(input): Json<SubmissionInput>,
) -> Result<(StatusCode, Json<Value>), AppError> {
    verify_origin(&state.config, &headers)?;
    let row = find_survey(&state, "slug", &slug).await?.filter(|item| item.status == "published")
        .ok_or(AppError::NotFound("问卷不存在、未发布或已结束"))?;
    if row.access == "registered" && users::optional_user(&state, &headers).await?.is_none() { return Err(AppError::Unauthorized); }
    let questions: Vec<SurveyQuestion> = serde_json::from_str(&row.questions_json).map_err(|_| AppError::Internal)?;
    let answers = validate_answers(&questions, &input.answers)?;
    let serialized = serde_json::to_string(&answers).map_err(|_| AppError::Internal)?;
    if serialized.len() > 100_000 { return Err(AppError::PayloadTooLarge); }
    let ip = client_ip(&headers);
    let ip_hash = hash_value(&format!("{}:{ip}", row.id));
    let id = Uuid::new_v4().to_string();
    let result = sqlx::query("INSERT INTO survey_responses (id, survey_id, ip_hash, answers_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id).bind(&row.id).bind(ip_hash).bind(serialized).bind(now_ms()).execute(&state.db).await;
    if let Err(error) = result {
        if error.to_string().contains("survey_ip_limit") {
            return Err(AppError::SurveyLimit(format!("此 IP 最多可提交 {} 次", row.ip_limit)));
        }
        return Err(error.into());
    }
    let completion = if row.success_mode == "redirect" {
        json!({ "mode": "redirect", "redirectUrl": row.success_redirect_url })
    } else {
        json!({ "mode": "message", "content": row.success_content })
    };
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "responseId": id, "completion": completion }))))
}

pub(crate) async fn report_admin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    require_admin(&state, &headers).await?;
    let survey = find_survey(&state, "id", &id).await?.ok_or(AppError::NotFound("问卷不存在"))?;
    let questions: Vec<SurveyQuestion> = serde_json::from_str(&survey.questions_json).map_err(|_| AppError::Internal)?;
    let rows = sqlx::query_as::<_, ResponseRecord>("SELECT id, answers_json, created_at FROM survey_responses WHERE survey_id = ? ORDER BY created_at ASC")
        .bind(&id).fetch_all(&state.db).await?;
    let csv = build_csv(&questions, &rows)?;
    let filename = safe_filename(&format!("{}-答卷.csv", survey.title));
    let mut response = Response::new(Body::from(format!("\u{feff}{csv}")));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/csv; charset=utf-8"));
    response.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(header::CONTENT_DISPOSITION, HeaderValue::from_str(&content_disposition(&filename, false)).map_err(|_| AppError::Internal)?);
    Ok(response)
}

async fn find_survey(state: &AppState, field: &str, value: &str) -> Result<Option<SurveyRecord>, AppError> {
    let condition = if field == "slug" { "s.slug" } else { "s.id" };
    Ok(sqlx::query_as::<_, SurveyRecord>(&format!("{SURVEY_SELECT} WHERE {condition} = ? LIMIT 1"))
        .bind(value).fetch_optional(&state.db).await?)
}

fn survey_json(row: &SurveyRecord) -> Result<Value, AppError> {
    let questions: Value = serde_json::from_str(&row.questions_json).map_err(|_| AppError::Internal)?;
    Ok(json!({
        "id": row.id, "slug": row.slug, "title": row.title, "description": row.description,
        "status": row.status, "access": row.access, "ipLimit": row.ip_limit,
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
    }
    Ok(value)
}

fn validate_survey(input: &mut SurveyInput) -> Result<(), AppError> {
    input.slug = input.slug.trim().to_ascii_lowercase();
    input.title = input.title.trim().to_owned();
    input.description = input.description.trim().to_owned();
    input.access = input.access.trim().to_owned();
    input.submit_label = input.submit_label.trim().to_owned();
    input.success_mode = input.success_mode.trim().to_owned();
    input.success_redirect_url = input.success_redirect_url.trim().to_owned();
    input.success_content = HtmlSanitizer::default().clean(&input.success_content).to_string();
    let slug_valid = (3..=64).contains(&input.slug.len()) && input.slug.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !input.slug.starts_with('-') && !input.slug.ends_with('-');
    if !slug_valid { return Err(AppError::BadRequest("公开地址需为 3–64 位小写字母、数字或连字符".into())); }
    if input.title.is_empty() || input.title.chars().count() > 120 { return Err(AppError::BadRequest("请填写 1–120 字问卷标题".into())); }
    if input.description.chars().count() > 2000 { return Err(AppError::BadRequest("问卷说明不能超过 2000 字".into())); }
    if !matches!(input.status.as_str(), "draft" | "published" | "closed") { return Err(AppError::BadRequest("问卷状态无效".into())); }
    if !matches!(input.access.as_str(), "public" | "registered") { return Err(AppError::BadRequest("访问权限无效".into())); }
    if input.submit_label.is_empty() || input.submit_label.chars().count() > 40 { return Err(AppError::BadRequest("提交按钮文字需为 1–40 字".into())); }
    if !matches!(input.success_mode.as_str(), "message" | "redirect") { return Err(AppError::BadRequest("提交后动作无效".into())); }
    if input.success_content.len() > 100_000 || input.success_mode == "message" && input.success_content.trim().is_empty() { return Err(AppError::BadRequest("请填写有效的提交后提示内容".into())); }
    if input.success_mode == "redirect" && !safe_redirect(&input.success_redirect_url) { return Err(AppError::BadRequest("跳转网址需为站内路径或 HTTPS 网址".into())); }
    if !(1..=1000).contains(&input.ip_limit) { return Err(AppError::BadRequest("单 IP 作答次数需为 1–1000".into())); }
    if !(1..=200).contains(&input.questions.len()) { return Err(AppError::BadRequest("问卷需包含 1–200 道题".into())); }
    let mut ids = std::collections::HashSet::new();
    for (index, question) in input.questions.iter().enumerate() {
        if !valid_id(question.id()) || !ids.insert(question.id().to_owned()) { return Err(AppError::BadRequest(format!("第 {} 题编号无效或重复", index + 1))); }
        if question.title().trim().is_empty() || question.title().chars().count() > 300 { return Err(AppError::BadRequest(format!("请完善第 {} 题", index + 1))); }
        match question {
            SurveyQuestion::Single { options, .. } | SurveyQuestion::Multiple { options, .. } => validate_items(options, 2, 50, index)?,
            SurveyQuestion::MatrixSingle { rows, columns, .. } | SurveyQuestion::MatrixMultiple { rows, columns, .. } => {
                validate_items(rows, 1, 50, index)?; validate_items(columns, 2, 30, index)?;
            }
            SurveyQuestion::ShortText { max_length, text_type, fixed_digits, .. } => {
                if !(1..=5000).contains(max_length) { return Err(AppError::BadRequest(format!("第 {} 题字数限制需为 1–5000", index + 1))); }
                if !matches!(text_type.as_str(), "text" | "digits_fixed" | "id_card" | "name" | "english") { return Err(AppError::BadRequest(format!("第 {} 题字段类型无效", index + 1))); }
                if text_type == "digits_fixed" && !(1..=64).contains(fixed_digits) { return Err(AppError::BadRequest(format!("第 {} 题固定位数需为 1–64", index + 1))); }
            }
        }
    }
    Ok(())
}

fn validate_items(items: &[ChoiceItem], min: usize, max: usize, question_index: usize) -> Result<(), AppError> {
    if !(min..=max).contains(&items.len()) { return Err(AppError::BadRequest(format!("第 {} 题选项数量无效", question_index + 1))); }
    let mut ids = std::collections::HashSet::new();
    if items.iter().any(|item| !valid_id(&item.id) || !ids.insert(&item.id) || item.label.trim().is_empty() || item.label.chars().count() > 120) {
        return Err(AppError::BadRequest(format!("第 {} 题选项无效或重复", question_index + 1)));
    }
    Ok(())
}

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 80 && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn safe_redirect(value: &str) -> bool {
    if value.starts_with('/') && !value.starts_with("//") { return true; }
    let Some(rest) = value.strip_prefix("https://") else { return false; };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.is_empty() && !host.chars().any(char::is_whitespace) && (host.contains('.') || host == "localhost" || host.starts_with('['))
}

fn default_access() -> String { "public".into() }
fn default_submit_label() -> String { "提交答卷".into() }
fn default_success_mode() -> String { "message".into() }
fn default_success_content() -> String { "<h2>提交成功</h2><p>感谢填写，你的答卷已记录。</p>".into() }

fn validate_answers(questions: &[SurveyQuestion], raw: &Value) -> Result<Value, AppError> {
    let input = raw.as_object().ok_or_else(|| AppError::BadRequest("答卷内容无效".into()))?;
    let mut answers = Map::new();
    for (index, question) in questions.iter().enumerate() {
        let value = input.get(question.id()).unwrap_or(&Value::Null);
        let prefix = format!("第 {} 题", index + 1);
        match question {
            SurveyQuestion::Single { id, required, options, allow_other, other_required, .. } => {
                let object = value.as_object();
                let selected = object.and_then(|item| item.get("selected")).and_then(Value::as_str).unwrap_or("").trim();
                let other = object.and_then(|item| item.get("otherText")).and_then(Value::as_str).unwrap_or("").trim();
                if selected.is_empty() { if *required { return Err(AppError::BadRequest(format!("{prefix}为必答题"))); } continue; }
                if selected == "__other" { if !*allow_other { return Err(AppError::BadRequest(format!("{prefix}不允许其他选项"))); } if *other_required && other.is_empty() { return Err(AppError::BadRequest(format!("{prefix}请填写其他选项"))); } }
                else if !options.iter().any(|item| item.id == selected) { return Err(AppError::BadRequest(format!("{prefix}选项无效"))); }
                answers.insert(id.clone(), json!({ "selected": selected, "otherText": if selected == "__other" { other } else { "" } }));
            }
            SurveyQuestion::Multiple { id, required, options, allow_other, other_required, .. } => {
                let object = value.as_object();
                let selected: Vec<&str> = object.and_then(|item| item.get("selected")).and_then(Value::as_array).map(|items| items.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
                if selected.is_empty() { if *required { return Err(AppError::BadRequest(format!("{prefix}为必答题"))); } continue; }
                if selected.len() > options.len() + usize::from(*allow_other) || selected.iter().any(|choice| *choice != "__other" && !options.iter().any(|item| item.id == *choice) || *choice == "__other" && !*allow_other) { return Err(AppError::BadRequest(format!("{prefix}选项无效"))); }
                let mut unique = std::collections::HashSet::new();
                if selected.iter().any(|choice| !unique.insert(*choice)) { return Err(AppError::BadRequest(format!("{prefix}选项重复"))); }
                let other = object.and_then(|item| item.get("otherText")).and_then(Value::as_str).unwrap_or("").trim();
                if selected.contains(&"__other") && *other_required && other.is_empty() { return Err(AppError::BadRequest(format!("{prefix}请填写其他选项"))); }
                answers.insert(id.clone(), json!({ "selected": selected, "otherText": other }));
            }
            SurveyQuestion::MatrixSingle { id, required, rows, columns, .. } => {
                let object = value.as_object(); let mut normalized = Map::new();
                for row in rows { let selected = object.and_then(|item| item.get(&row.id)).and_then(Value::as_str).unwrap_or(""); if selected.is_empty() { if *required { return Err(AppError::BadRequest(format!("{prefix}的“{}”未作答", row.label))); } continue; } if !columns.iter().any(|column| column.id == selected) { return Err(AppError::BadRequest(format!("{prefix}选项无效"))); } normalized.insert(row.id.clone(), json!(selected)); }
                if object.is_some_and(|item| item.keys().any(|key| !rows.iter().any(|row| row.id == *key))) { return Err(AppError::BadRequest(format!("{prefix}矩阵行无效"))); }
                if !normalized.is_empty() { answers.insert(id.clone(), Value::Object(normalized)); }
            }
            SurveyQuestion::MatrixMultiple { id, required, rows, columns, .. } => {
                let object = value.as_object(); let mut normalized = Map::new();
                for row in rows { let selected = object.and_then(|item| item.get(&row.id)).and_then(Value::as_array).cloned().unwrap_or_default(); if selected.is_empty() { if *required { return Err(AppError::BadRequest(format!("{prefix}的“{}”未作答", row.label))); } continue; } if selected.iter().any(|choice| choice.as_str().is_none_or(|choice| !columns.iter().any(|column| column.id == choice))) { return Err(AppError::BadRequest(format!("{prefix}选项无效"))); } normalized.insert(row.id.clone(), Value::Array(selected)); }
                if object.is_some_and(|item| item.keys().any(|key| !rows.iter().any(|row| row.id == *key))) { return Err(AppError::BadRequest(format!("{prefix}矩阵行无效"))); }
                if !normalized.is_empty() { answers.insert(id.clone(), Value::Object(normalized)); }
            }
            SurveyQuestion::ShortText { id, required, max_length, text_type, fixed_digits, .. } => {
                let answer = value.as_str().unwrap_or("").trim();
                if answer.is_empty() { if *required { return Err(AppError::BadRequest(format!("{prefix}为必答题"))); } continue; }
                if answer.chars().count() > *max_length { return Err(AppError::BadRequest(format!("{prefix}不能超过 {max_length} 字"))); }
                let valid = match text_type.as_str() { "digits_fixed" => answer.len() == *fixed_digits && answer.bytes().all(|byte| byte.is_ascii_digit()), "id_card" => valid_id_card(answer), "name" => (2..=50).contains(&answer.chars().count()) && answer.chars().all(|character| character.is_ascii_alphabetic() || ('\u{4e00}'..='\u{9fff}').contains(&character) || matches!(character, '·' | '.' | ' ')), "english" => answer.chars().next().is_some_and(|character| character.is_ascii_alphabetic()) && answer.chars().all(|character| character.is_ascii_alphabetic() || matches!(character, ' ' | '.' | '\'' | '-')), _ => true };
                if !valid { return Err(AppError::BadRequest(format!("{prefix}格式无效"))); }
                answers.insert(id.clone(), json!(answer));
            }
        }
    }
    Ok(Value::Object(answers))
}

fn valid_id_card(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 18 || !bytes[..17].iter().all(u8::is_ascii_digit) { return false; }
    if &bytes[..6] == b"000000" { return false; }
    let number = |range: std::ops::Range<usize>| bytes[range].iter().fold(0usize, |total, byte| total * 10 + (*byte - b'0') as usize);
    let year = number(6..10); let month = number(10..12); let day = number(12..14);
    let leap = year % 400 == 0 || year % 4 == 0 && year % 100 != 0;
    let days = match month { 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, 4 | 6 | 9 | 11 => 30, 2 if leap => 29, 2 => 28, _ => 0 };
    if day == 0 || day > days { return false; }
    let weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let checks = b"10X98765432";
    let sum: usize = value.bytes().take(17).zip(weights).map(|(byte, weight)| (byte - b'0') as usize * weight).sum();
    checks[sum % 11] == bytes[17].to_ascii_uppercase()
}

fn client_ip(headers: &HeaderMap) -> &str {
    headers.get("cf-connecting-ip").or_else(|| headers.get("x-forwarded-for")).or_else(|| headers.get("x-real-ip"))
        .and_then(|value| value.to_str().ok()).and_then(|value| value.split(',').next()).map(str::trim).filter(|value| !value.is_empty()).unwrap_or("unknown")
}

fn build_csv(questions: &[SurveyQuestion], rows: &[ResponseRecord]) -> Result<String, AppError> {
    let mut headings = vec!["答卷编号".to_owned(), "提交时间".to_owned()];
    for (index, question) in questions.iter().enumerate() {
        match question { SurveyQuestion::MatrixSingle { rows, .. } | SurveyQuestion::MatrixMultiple { rows, .. } => for row in rows { headings.push(format!("{}. {} / {}", index + 1, question.title(), row.label)); }, _ => headings.push(format!("{}. {}", index + 1, question.title())) }
    }
    let mut lines = vec![headings.iter().map(|value| csv_cell(value)).collect::<Vec<_>>().join(",")];
    for row in rows {
        let answers: Value = serde_json::from_str(&row.answers_json).map_err(|_| AppError::Internal)?;
        let mut cells = vec![row.id.clone(), row.created_at.to_string()];
        for question in questions {
            let value = answers.get(question.id()).unwrap_or(&Value::Null);
            match question { SurveyQuestion::MatrixSingle { rows, .. } | SurveyQuestion::MatrixMultiple { rows, .. } => for matrix_row in rows { cells.push(display_answer(question, value, Some(&matrix_row.id))); }, _ => cells.push(display_answer(question, value, None)) }
        }
        lines.push(cells.iter().map(|value| csv_cell(value)).collect::<Vec<_>>().join(","));
    }
    Ok(lines.join("\r\n"))
}

fn display_answer(question: &SurveyQuestion, value: &Value, row: Option<&str>) -> String {
    match question {
        SurveyQuestion::ShortText { .. } => value.as_str().unwrap_or("").to_owned(),
        SurveyQuestion::Single { options, .. } | SurveyQuestion::Multiple { options, .. } => {
            let object = value.as_object(); let selected = object.and_then(|item| item.get("selected")); let ids: Vec<&str> = selected.and_then(Value::as_array).map(|items| items.iter().filter_map(Value::as_str).collect()).or_else(|| selected.and_then(Value::as_str).map(|item| vec![item])).unwrap_or_default(); let other = object.and_then(|item| item.get("otherText")).and_then(Value::as_str).unwrap_or(""); ids.iter().map(|id| if *id == "__other" { format!("其他：{other}") } else { options.iter().find(|item| item.id == *id).map(|item| item.label.clone()).unwrap_or_else(|| (*id).to_owned()) }).collect::<Vec<_>>().join("；")
        }
        SurveyQuestion::MatrixSingle { columns, .. } | SurveyQuestion::MatrixMultiple { columns, .. } => {
            let selected = row.and_then(|row| value.get(row)); let ids: Vec<&str> = selected.and_then(Value::as_array).map(|items| items.iter().filter_map(Value::as_str).collect()).or_else(|| selected.and_then(Value::as_str).map(|item| vec![item])).unwrap_or_default(); ids.iter().map(|id| columns.iter().find(|item| item.id == *id).map(|item| item.label.clone()).unwrap_or_else(|| (*id).to_owned())).collect::<Vec<_>>().join("；")
        }
    }
}

fn csv_cell(value: &str) -> String { let safe = if matches!(value.as_bytes().first(), Some(b'=' | b'+' | b'-' | b'@')) { format!("'{value}") } else { value.to_owned() }; format!("\"{}\"", safe.replace('"', "\"\"")) }
fn safe_filename(value: &str) -> String { let value: String = value.chars().map(|character| if character.is_control() || "\\/:*?\"<>|".contains(character) { '-' } else { character }).take(100).collect(); if value.trim().is_empty() { "survey-report.csv".into() } else { value } }
fn one() -> usize { 1 }

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
