mod common;

use base64::{engine::general_purpose::STANDARD, Engine};
use common::{app, cleanup_account, register_account, request, sign};
use serde_json::json;
use sha2::Digest;
use umbrachat_server::db;

#[tokio::test]
async fn authenticated_request_with_valid_signature_succeeds() {
    let app = app().await;
    let alice = register_account(&app).await;

    let path = format!("/v1/accounts/{}/prekey-bundle", alice.account_id);
    let (timestamp, signature) = sign(&alice.identity, "GET", &path, b"");
    let headers = [
        ("x-account-id", alice.account_id.to_string()),
        ("x-timestamp", timestamp),
        ("x-signature", signature),
    ];
    let header_refs: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let (status, _body) = request(&app, "GET", &path, &header_refs, json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::OK);

    let pool = db::connect().await;
    cleanup_account(&pool, alice.account_id).await;
}

#[tokio::test]
async fn authenticated_request_with_tampered_signature_is_rejected() {
    let app = app().await;
    let alice = register_account(&app).await;

    let path = format!("/v1/accounts/{}/prekey-bundle", alice.account_id);
    let (timestamp, _signature) = sign(&alice.identity, "GET", &path, b"");
    let headers = [
        ("x-account-id", alice.account_id.to_string()),
        ("x-timestamp", timestamp),
        ("x-signature", STANDARD.encode([0u8; 64])),
    ];
    let header_refs: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let (status, _body) = request(&app, "GET", &path, &header_refs, json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);

    let pool = db::connect().await;
    cleanup_account(&pool, alice.account_id).await;
}

#[tokio::test]
async fn authenticated_request_with_stale_timestamp_is_rejected() {
    let app = app().await;
    let alice = register_account(&app).await;

    let path = format!("/v1/accounts/{}/prekey-bundle", alice.account_id);
    let stale_timestamp = "1000000000"; // way in the past
    let body_hash = hex::encode(sha2::Sha256::digest(b""));
    let message = format!("GET\n{path}\n{stale_timestamp}\n{body_hash}");
    let mut rng = rand::rng();
    let signature = alice.identity.private_key().calculate_signature(message.as_bytes(), &mut rng).unwrap();

    let headers = [
        ("x-account-id", alice.account_id.to_string()),
        ("x-timestamp", stale_timestamp.to_string()),
        ("x-signature", STANDARD.encode(signature)),
    ];
    let header_refs: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let (status, _body) = request(&app, "GET", &path, &header_refs, json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);

    let pool = db::connect().await;
    cleanup_account(&pool, alice.account_id).await;
}

#[tokio::test]
async fn prekey_bundle_never_hands_out_the_same_one_time_prekey_twice() {
    let app = app().await;
    let alice = register_account(&app).await; // registers exactly one one-time prekey
    let bob = register_account(&app).await;

    let path = format!("/v1/accounts/{}/prekey-bundle", alice.account_id);

    let (timestamp1, signature1) = sign(&bob.identity, "GET", &path, b"");
    let headers1 = [
        ("x-account-id", bob.account_id.to_string()),
        ("x-timestamp", timestamp1),
        ("x-signature", signature1),
    ];
    let refs1: Vec<(&str, &str)> = headers1.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (status1, body1) = request(&app, "GET", &path, &refs1, json!(null)).await;
    assert_eq!(status1, axum::http::StatusCode::OK);
    assert!(body1["one_time_prekey"].is_object(), "first fetch should hand out the one registered one-time prekey");

    let (timestamp2, signature2) = sign(&bob.identity, "GET", &path, b"");
    let headers2 = [
        ("x-account-id", bob.account_id.to_string()),
        ("x-timestamp", timestamp2),
        ("x-signature", signature2),
    ];
    let refs2: Vec<(&str, &str)> = headers2.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (status2, body2) = request(&app, "GET", &path, &refs2, json!(null)).await;
    assert_eq!(status2, axum::http::StatusCode::OK);
    assert!(body2["one_time_prekey"].is_null(), "second fetch must not reuse the same one-time prekey");

    let pool = db::connect().await;
    cleanup_account(&pool, alice.account_id).await;
    cleanup_account(&pool, bob.account_id).await;
}

#[tokio::test]
async fn sending_then_fetching_returns_the_message_exactly_once() {
    let app = app().await;
    let alice = register_account(&app).await;
    let bob = register_account(&app).await;

    let send_body = json!({
        "recipient_account_id": bob.account_id,
        "ciphertext": STANDARD.encode(b"hello bob"),
    });
    let (send_timestamp, send_signature) = sign(&alice.identity, "POST", "/v1/messages", send_body.to_string().as_bytes());
    let send_headers = [
        ("x-account-id", alice.account_id.to_string()),
        ("x-timestamp", send_timestamp),
        ("x-signature", send_signature),
    ];
    let send_refs: Vec<(&str, &str)> = send_headers.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (send_status, _send_body) = request(&app, "POST", "/v1/messages", &send_refs, send_body).await;
    assert_eq!(send_status, axum::http::StatusCode::CREATED);

    let (fetch_timestamp, fetch_signature) = sign(&bob.identity, "GET", "/v1/messages", b"");
    let fetch_headers = [
        ("x-account-id", bob.account_id.to_string()),
        ("x-timestamp", fetch_timestamp),
        ("x-signature", fetch_signature),
    ];
    let fetch_refs: Vec<(&str, &str)> = fetch_headers.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (fetch_status, fetch_body) = request(&app, "GET", "/v1/messages", &fetch_refs, json!(null)).await;
    assert_eq!(fetch_status, axum::http::StatusCode::OK);
    let messages = fetch_body.as_array().unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["sender_account_id"], alice.account_id.to_string());

    let (refetch_timestamp, refetch_signature) = sign(&bob.identity, "GET", "/v1/messages", b"");
    let refetch_headers = [
        ("x-account-id", bob.account_id.to_string()),
        ("x-timestamp", refetch_timestamp),
        ("x-signature", refetch_signature),
    ];
    let refetch_refs: Vec<(&str, &str)> = refetch_headers.iter().map(|(k, v)| (*k, v.as_str())).collect();
    let (refetch_status, refetch_body) = request(&app, "GET", "/v1/messages", &refetch_refs, json!(null)).await;
    assert_eq!(refetch_status, axum::http::StatusCode::OK);
    assert_eq!(refetch_body.as_array().unwrap().len(), 0, "a message must not be returned twice");

    let pool = db::connect().await;
    cleanup_account(&pool, alice.account_id).await;
    cleanup_account(&pool, bob.account_id).await;
}
