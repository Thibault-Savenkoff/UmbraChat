use axum::{extract::State, http::StatusCode, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::{Authenticated, AuthenticatedAccount};
use crate::error::{bad_request, server_error, ApiError};

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub recipient_account_id: Uuid,
    pub ciphertext: String, // base64
}

#[derive(Serialize)]
pub struct SendMessageResponse {
    pub id: Uuid,
}

pub async fn send_message(
    State(pool): State<PgPool>,
    Authenticated { account_id: sender_id, body }: Authenticated<SendMessageRequest>,
) -> Result<(StatusCode, Json<SendMessageResponse>), ApiError> {
    let ciphertext = STANDARD.decode(&body.ciphertext).map_err(|_| bad_request("ciphertext is not valid base64"))?;

    let id = sqlx::query_scalar!(
        "INSERT INTO messages (sender_account_id, recipient_account_id, ciphertext) VALUES ($1, $2, $3) RETURNING id",
        sender_id,
        body.recipient_account_id,
        ciphertext,
    )
    .fetch_one(&pool)
    .await
    .map_err(|_| server_error())?;

    Ok((StatusCode::CREATED, Json(SendMessageResponse { id })))
}

#[derive(Serialize)]
pub struct ReceivedMessage {
    pub sender_account_id: Uuid,
    pub ciphertext: String, // base64
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn fetch_messages(
    State(pool): State<PgPool>,
    AuthenticatedAccount(account_id): AuthenticatedAccount,
) -> Result<Json<Vec<ReceivedMessage>>, ApiError> {
    let rows = sqlx::query!(
        "DELETE FROM messages WHERE recipient_account_id = $1 RETURNING sender_account_id, ciphertext, created_at",
        account_id
    )
    .fetch_all(&pool)
    .await
    .map_err(|_| server_error())?;

    Ok(Json(
        rows.into_iter()
            .map(|r| ReceivedMessage {
                sender_account_id: r.sender_account_id,
                ciphertext: STANDARD.encode(r.ciphertext),
                created_at: r.created_at,
            })
            .collect(),
    ))
}
