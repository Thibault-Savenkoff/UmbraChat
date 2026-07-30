use base64::{engine::general_purpose::STANDARD, Engine};
use http_body_util::BodyExt;
use libsignal_protocol::{kem, IdentityKeyPair, KeyPair};
use rand::Rng;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;
use umbrachat_server::{db, routes};
use uuid::Uuid;

// A real, syntactically valid VAPID key so any test that does exercise a
// push send (via a registered subscription) doesn't fail on key parsing -
// its actual value doesn't matter since no test push service is contacted
// during this run.
pub const TEST_VAPID_PRIVATE_KEY: &str = "4rISdCDvPIdiTUpJbPqHt2gi3TCVqEq0sCnqi9iykXQ";

pub async fn app() -> axum::Router {
    let pool = db::connect().await;
    routes::router(pool, TEST_VAPID_PRIVATE_KEY.to_string())
}

pub async fn request(app: &axum::Router, method: &str, path: &str, headers: &[(&str, &str)], body: Value) -> (axum::http::StatusCode, Value) {
    let mut builder = axum::http::Request::builder().method(method).uri(path).header("content-type", "application/json");
    for (name, value) in headers {
        builder = builder.header(*name, *value);
    }
    let response = app
        .clone()
        .oneshot(builder.body(axum::body::Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
    (status, json)
}

/// Signs `METHOD\nPATH\nTIMESTAMP\nSHA256_HEX(BODY)` the same way the real client does,
/// returning the `(X-Timestamp, X-Signature)` header values.
pub fn sign(identity: &IdentityKeyPair, method: &str, path: &str, body: &[u8]) -> (String, String) {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs().to_string();
    let body_hash = hex::encode(Sha256::digest(body));
    let message = format!("{method}\n{path}\n{timestamp}\n{body_hash}");
    let mut rng = rand::rng();
    let signature = identity.private_key().calculate_signature(message.as_bytes(), &mut rng).unwrap();
    (timestamp, STANDARD.encode(signature))
}

pub struct TestAccount {
    pub account_id: Uuid,
    pub device_id: Uuid,
    pub identity: IdentityKeyPair,
}

/// Registers a fresh account through the real /v1/register endpoint, so tests
/// exercise the same path a real client would.
pub async fn register_account(app: &axum::Router) -> TestAccount {
    let mut rng = rand::rng();
    let identity = IdentityKeyPair::generate(&mut rng);
    let signed_prekey = KeyPair::generate(&mut rng);
    let one_time_prekey = KeyPair::generate(&mut rng);

    let signed_prekey_public = signed_prekey.public_key.serialize();
    let signature = identity.private_key().calculate_signature(&signed_prekey_public, &mut rng).unwrap();

    let kyber_prekey = kem::KeyPair::generate(kem::KeyType::Kyber1024, &mut rng);
    let kyber_prekey_public = kyber_prekey.public_key.serialize();
    let kyber_signature = identity.private_key().calculate_signature(&kyber_prekey_public, &mut rng).unwrap();

    let body = json!({
        "identity_public_key": STANDARD.encode(identity.identity_key().serialize()),
        "registration_id": rng.random_range(1u32..16384),
        "signed_prekey": {
            "key_id": 1,
            "public_key": STANDARD.encode(&signed_prekey_public),
            "signature": STANDARD.encode(&signature),
        },
        "kyber_signed_prekey": {
            "key_id": 1,
            "public_key": STANDARD.encode(&kyber_prekey_public),
            "signature": STANDARD.encode(&kyber_signature),
        },
        "one_time_prekeys": [
            { "key_id": 1, "public_key": STANDARD.encode(one_time_prekey.public_key.serialize()) }
        ],
    });

    let (status, response) = request(app, "POST", "/v1/register", &[], body).await;
    assert_eq!(status, axum::http::StatusCode::CREATED, "test account registration must succeed");

    let account_id: Uuid = response["account_id"].as_str().unwrap().parse().unwrap();
    let device_id: Uuid = response["device_id"].as_str().unwrap().parse().unwrap();
    TestAccount { account_id, device_id, identity }
}

pub async fn cleanup_account(pool: &sqlx::PgPool, account_id: Uuid) {
    sqlx::query!("DELETE FROM accounts WHERE id = $1", account_id).execute(pool).await.unwrap();
}
