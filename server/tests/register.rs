use base64::{engine::general_purpose::STANDARD, Engine};
use http_body_util::BodyExt;
use libsignal_protocol::{IdentityKeyPair, KeyPair};
use serde_json::{json, Value};
use tower::ServiceExt;
use umbrachat_server::{db, routes};

async fn app() -> axum::Router {
    let pool = db::connect().await;
    routes::router(pool)
}

fn valid_register_body() -> Value {
    let mut rng = rand::rng();
    let identity = IdentityKeyPair::generate(&mut rng);
    let signed_prekey = KeyPair::generate(&mut rng);
    let one_time_prekey = KeyPair::generate(&mut rng);

    let signed_prekey_public = signed_prekey.public_key.serialize();
    let signature = identity
        .private_key()
        .calculate_signature(&signed_prekey_public, &mut rng)
        .expect("signing must succeed");

    json!({
        "identity_public_key": STANDARD.encode(identity.identity_key().serialize()),
        "registration_id": 1,
        "signed_prekey": {
            "key_id": 1,
            "public_key": STANDARD.encode(&signed_prekey_public),
            "signature": STANDARD.encode(&signature),
        },
        "one_time_prekeys": [
            {
                "key_id": 1,
                "public_key": STANDARD.encode(one_time_prekey.public_key.serialize()),
            }
        ],
    })
}

#[tokio::test]
async fn register_with_valid_bundle_returns_201() {
    let app = app().await;
    let body = valid_register_body();

    let response = app
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri("/v1/register")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::CREATED);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(json["account_id"].is_string());
}

#[tokio::test]
async fn register_with_invalid_signature_returns_4xx_and_persists_nothing() {
    let app = app().await;
    let mut body = valid_register_body();
    // Corrupt the signature so it no longer verifies against the identity key.
    body["signed_prekey"]["signature"] = json!(STANDARD.encode([0u8; 64]));

    let response = app
        .clone()
        .oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri("/v1/register")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status().is_client_error());

    // Nothing should have been persisted for this identity key.
    let identity_public_key = body["identity_public_key"].as_str().unwrap();
    let identity_key_bytes = STANDARD.decode(identity_public_key).unwrap();
    let pool = db::connect().await;
    let count: i64 = sqlx::query_scalar!(
        "SELECT count(*) FROM identity_keys WHERE public_key = $1",
        identity_key_bytes
    )
    .fetch_one(&pool)
    .await
    .unwrap()
    .unwrap_or(0);
    assert_eq!(count, 0);
}
