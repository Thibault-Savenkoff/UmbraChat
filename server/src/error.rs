use axum::{http::StatusCode, Json};
use serde::Serialize;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub type ApiError = (StatusCode, Json<ErrorResponse>);

pub fn bad_request(msg: &str) -> ApiError {
    (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: msg.to_string() }))
}

pub fn unauthorized(msg: &str) -> ApiError {
    (StatusCode::UNAUTHORIZED, Json(ErrorResponse { error: msg.to_string() }))
}

pub fn forbidden(msg: &str) -> ApiError {
    (StatusCode::FORBIDDEN, Json(ErrorResponse { error: msg.to_string() }))
}

pub fn not_found(msg: &str) -> ApiError {
    (StatusCode::NOT_FOUND, Json(ErrorResponse { error: msg.to_string() }))
}

pub fn server_error() -> ApiError {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { error: "database error".to_string() }),
    )
}
