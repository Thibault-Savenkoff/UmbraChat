use axum::{extract::State, http::StatusCode, Json};
use base64::{engine::general_purpose::STANDARD, Engine};
use libsignal_protocol::{IdentityKey, PublicKey};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct SignedPrekeyDto {
    pub key_id: i32,
    pub public_key: String, // base64
    pub signature: String,  // base64
}

#[derive(Deserialize)]
pub struct PrekeyDto {
    pub key_id: i32,
    pub public_key: String, // base64
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub identity_public_key: String, // base64
    pub registration_id: i32,
    pub signed_prekey: SignedPrekeyDto,
    pub one_time_prekeys: Vec<PrekeyDto>,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub account_id: Uuid,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

const MAX_ONE_TIME_PREKEYS: usize = 100;

type ApiError = (StatusCode, Json<ErrorResponse>);

fn bad_request(msg: &str) -> ApiError {
    (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: msg.to_string() }))
}

fn server_error() -> ApiError {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse { error: "database error".to_string() }),
    )
}

pub async fn register(
    State(pool): State<PgPool>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<RegisterResponse>), ApiError> {
    let identity_key_bytes = STANDARD
        .decode(&req.identity_public_key)
        .map_err(|_| bad_request("identity_public_key is not valid base64"))?;
    let identity_key = IdentityKey::decode(&identity_key_bytes)
        .map_err(|_| bad_request("identity_public_key is not a valid identity key"))?;

    let signed_prekey_bytes = STANDARD
        .decode(&req.signed_prekey.public_key)
        .map_err(|_| bad_request("signed_prekey.public_key is not valid base64"))?;
    let signature_bytes = STANDARD
        .decode(&req.signed_prekey.signature)
        .map_err(|_| bad_request("signed_prekey.signature is not valid base64"))?;

    let signature_valid = identity_key
        .public_key()
        .verify_signature(&signed_prekey_bytes, &signature_bytes);
    if !signature_valid {
        return Err(bad_request(
            "signed_prekey signature does not verify against identity_public_key",
        ));
    }

    if req.one_time_prekeys.len() > MAX_ONE_TIME_PREKEYS {
        return Err(bad_request("too many one_time_prekeys in a single registration"));
    }

    let mut one_time_prekeys = Vec::with_capacity(req.one_time_prekeys.len());
    for prekey in &req.one_time_prekeys {
        let bytes = STANDARD
            .decode(&prekey.public_key)
            .map_err(|_| bad_request("a one_time_prekeys public_key is not valid base64"))?;
        PublicKey::deserialize(&bytes).map_err(|_| bad_request("a one_time_prekeys public_key is not a valid key"))?;
        one_time_prekeys.push((prekey.key_id, bytes));
    }

    let mut tx = pool.begin().await.map_err(|_| server_error())?;

    let account_id = sqlx::query_scalar!("INSERT INTO accounts DEFAULT VALUES RETURNING id")
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| server_error())?;

    sqlx::query!(
        "INSERT INTO identity_keys (account_id, public_key, registration_id) VALUES ($1, $2, $3)",
        account_id,
        identity_key_bytes,
        req.registration_id,
    )
    .execute(&mut *tx)
    .await
    .map_err(|_| server_error())?;

    sqlx::query!(
        "INSERT INTO signed_prekeys (account_id, key_id, public_key, signature) VALUES ($1, $2, $3, $4)",
        account_id,
        req.signed_prekey.key_id,
        signed_prekey_bytes,
        signature_bytes,
    )
    .execute(&mut *tx)
    .await
    .map_err(|_| server_error())?;

    for (key_id, public_key) in &one_time_prekeys {
        sqlx::query!(
            "INSERT INTO prekeys (account_id, key_id, public_key) VALUES ($1, $2, $3)",
            account_id,
            key_id,
            public_key,
        )
        .execute(&mut *tx)
        .await
        .map_err(|_| server_error())?;
    }

    tx.commit().await.map_err(|_| server_error())?;

    Ok((StatusCode::CREATED, Json(RegisterResponse { account_id })))
}
