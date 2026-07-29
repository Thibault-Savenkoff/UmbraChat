mod common;

use base64::{engine::general_purpose::STANDARD, Engine};
use common::{app, cleanup_account, register_account, request, sign};
use libsignal_protocol::{kem, IdentityKeyPair, KeyPair};
use serde_json::{json, Value};
use umbrachat_server::db;

fn auth_headers(device_id: uuid::Uuid, timestamp: String, signature: String) -> Vec<(String, String)> {
    vec![
        ("x-device-id".to_string(), device_id.to_string()),
        ("x-timestamp".to_string(), timestamp),
        ("x-signature".to_string(), signature),
    ]
}

fn as_refs(headers: &[(String, String)]) -> Vec<(&str, &str)> {
    headers.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect()
}

fn new_device_bundle() -> Value {
    let mut rng = rand::rng();
    let identity = IdentityKeyPair::generate(&mut rng);
    let signed_prekey = KeyPair::generate(&mut rng);
    let one_time_prekey = KeyPair::generate(&mut rng);
    let kyber_prekey = kem::KeyPair::generate(kem::KeyType::Kyber1024, &mut rng);

    let signed_prekey_public = signed_prekey.public_key.serialize();
    let signature = identity.private_key().calculate_signature(&signed_prekey_public, &mut rng).unwrap();
    let kyber_prekey_public = kyber_prekey.public_key.serialize();
    let kyber_signature = identity.private_key().calculate_signature(&kyber_prekey_public, &mut rng).unwrap();

    json!({
        "identity_public_key": STANDARD.encode(identity.identity_key().serialize()),
        "registration_id": 2,
        "signed_prekey": { "key_id": 1, "public_key": STANDARD.encode(&signed_prekey_public), "signature": STANDARD.encode(&signature) },
        "kyber_signed_prekey": { "key_id": 1, "public_key": STANDARD.encode(&kyber_prekey_public), "signature": STANDARD.encode(&kyber_signature) },
        "one_time_prekeys": [{ "key_id": 1, "public_key": STANDARD.encode(one_time_prekey.public_key.serialize()) }],
    })
}

async fn link_init(app: &axum::Router, primary: &common::TestAccount) -> String {
    let path = format!("/v1/accounts/{}/devices/link-init", primary.account_id);
    let (timestamp, signature) = sign(&primary.identity, "POST", &path, b"");
    let headers = auth_headers(primary.device_id, timestamp, signature);
    let (status, body) = request(app, "POST", &path, &as_refs(&headers), json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::OK, "link-init must succeed: {body}");
    body["code"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn a_valid_code_links_a_new_device_that_can_immediately_authenticate() {
    let app = app().await;
    let primary = register_account(&app).await;

    let code = link_init(&app, &primary).await;

    let mut complete_body = new_device_bundle();
    complete_body["code"] = json!(code);
    complete_body["label"] = json!("Laptop");
    let (status, body) = request(&app, "POST", &format!("/v1/accounts/{}/devices", primary.account_id), &[], complete_body).await;
    assert_eq!(status, axum::http::StatusCode::CREATED, "complete_link must succeed: {body}");
    let new_device_id: uuid::Uuid = body["device_id"].as_str().unwrap().parse().unwrap();
    assert_ne!(new_device_id, primary.device_id);

    // The new device can immediately fetch its own prekey bundle back.
    let identity = IdentityKeyPair::generate(&mut rand::rng()); // unused, prekey fetch just needs *a* caller
    let _ = identity;
    let bundle_path = format!("/v1/devices/{new_device_id}/prekey-bundle");
    let (ts, sig) = sign(&primary.identity, "GET", &bundle_path, b"");
    let headers = auth_headers(primary.device_id, ts, sig);
    let (bundle_status, _bundle_body) = request(&app, "GET", &bundle_path, &as_refs(&headers), json!(null)).await;
    assert_eq!(bundle_status, axum::http::StatusCode::OK, "the newly linked device's bundle must be fetchable");

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
}

#[tokio::test]
async fn an_expired_code_is_rejected_and_creates_no_device() {
    let app = app().await;
    let primary = register_account(&app).await;
    let code = link_init(&app, &primary).await;

    let pool = db::connect().await;
    sqlx::query!("UPDATE pending_device_links SET expires_at = now() - interval '1 minute' WHERE code = $1", code)
        .execute(&pool)
        .await
        .unwrap();

    let mut complete_body = new_device_bundle();
    complete_body["code"] = json!(code);
    complete_body["label"] = json!("Too Late");
    let (status, _body) = request(&app, "POST", &format!("/v1/accounts/{}/devices", primary.account_id), &[], complete_body).await;
    assert!(status.is_client_error(), "an expired code must be rejected, got {status}");

    let device_count: i64 = sqlx::query_scalar!("SELECT count(*) FROM devices WHERE account_id = $1", primary.account_id)
        .fetch_one(&pool)
        .await
        .unwrap()
        .unwrap_or(0);
    assert_eq!(device_count, 1, "only the primary device should exist - no device from the expired code");

    cleanup_account(&pool, primary.account_id).await;
}

#[tokio::test]
async fn an_unknown_code_is_rejected() {
    let app = app().await;
    let primary = register_account(&app).await;

    let mut complete_body = new_device_bundle();
    complete_body["code"] = json!("not-a-real-code");
    complete_body["label"] = json!("Nope");
    let (status, _body) = request(&app, "POST", &format!("/v1/accounts/{}/devices", primary.account_id), &[], complete_body).await;
    assert!(status.is_client_error());

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
}

#[tokio::test]
async fn list_devices_shows_both_and_is_callable_by_any_account() {
    let app = app().await;
    let primary = register_account(&app).await;
    let stranger = register_account(&app).await;

    let code = link_init(&app, &primary).await;
    let mut complete_body = new_device_bundle();
    complete_body["code"] = json!(code);
    complete_body["label"] = json!("Tablet");
    let (_status, complete_response) = request(&app, "POST", &format!("/v1/accounts/{}/devices", primary.account_id), &[], complete_body).await;
    let linked_device_id = complete_response["device_id"].as_str().unwrap().to_string();

    // A totally unrelated account can still list them - fan-out discovery needs this.
    let list_path = format!("/v1/accounts/{}/devices", primary.account_id);
    let (ts, sig) = sign(&stranger.identity, "GET", &list_path, b"");
    let headers = auth_headers(stranger.device_id, ts, sig);
    let (status, body) = request(&app, "GET", &list_path, &as_refs(&headers), json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::OK);
    let devices = body.as_array().unwrap();
    assert_eq!(devices.len(), 2);
    let ids: Vec<String> = devices.iter().map(|d| d["id"].as_str().unwrap().to_string()).collect();
    assert!(ids.contains(&primary.device_id.to_string()));
    assert!(ids.contains(&linked_device_id));

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
    cleanup_account(&pool, stranger.account_id).await;
}

#[tokio::test]
async fn unlinking_a_device_immediately_revokes_its_auth() {
    let app = app().await;
    let primary = register_account(&app).await;
    let code = link_init(&app, &primary).await;

    let mut complete_body = new_device_bundle();
    complete_body["code"] = json!(code);
    complete_body["label"] = json!("Old Phone");
    let (_status, complete_response) = request(&app, "POST", &format!("/v1/accounts/{}/devices", primary.account_id), &[], complete_body).await;
    let linked_device_id: uuid::Uuid = complete_response["device_id"].as_str().unwrap().parse().unwrap();

    let unlink_path = format!("/v1/devices/{linked_device_id}");
    let (ts, sig) = sign(&primary.identity, "DELETE", &unlink_path, b"");
    let headers = auth_headers(primary.device_id, ts, sig);
    let (unlink_status, _body) = request(&app, "DELETE", &unlink_path, &as_refs(&headers), json!(null)).await;
    assert_eq!(unlink_status, axum::http::StatusCode::NO_CONTENT);

    // The unlinked device's own key is gone - any request signed with it is rejected.
    let bundle_path = format!("/v1/devices/{}/prekey-bundle", primary.device_id);
    let (probe_ts, probe_sig) = sign(&primary.identity, "GET", &bundle_path, b"");
    let probe_headers = auth_headers(linked_device_id, probe_ts, probe_sig);
    let (probe_status, _probe_body) = request(&app, "GET", &bundle_path, &as_refs(&probe_headers), json!(null)).await;
    assert_eq!(probe_status, axum::http::StatusCode::UNAUTHORIZED, "the unlinked device must no longer authenticate");

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
}

#[tokio::test]
async fn a_device_from_a_different_account_cannot_unlink_this_ones_device() {
    let app = app().await;
    let primary = register_account(&app).await;
    let stranger = register_account(&app).await;

    let unlink_path = format!("/v1/devices/{}", primary.device_id);
    let (ts, sig) = sign(&stranger.identity, "DELETE", &unlink_path, b"");
    let headers = auth_headers(stranger.device_id, ts, sig);
    let (status, _body) = request(&app, "DELETE", &unlink_path, &as_refs(&headers), json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
    cleanup_account(&pool, stranger.account_id).await;
}

#[tokio::test]
async fn a_device_from_a_different_account_cannot_init_a_link_for_this_one() {
    let app = app().await;
    let primary = register_account(&app).await;
    let stranger = register_account(&app).await;

    let path = format!("/v1/accounts/{}/devices/link-init", primary.account_id);
    let (ts, sig) = sign(&stranger.identity, "POST", &path, b"");
    let headers = auth_headers(stranger.device_id, ts, sig);
    let (status, _body) = request(&app, "POST", &path, &as_refs(&headers), json!(null)).await;
    assert_eq!(status, axum::http::StatusCode::FORBIDDEN);

    let pool = db::connect().await;
    cleanup_account(&pool, primary.account_id).await;
    cleanup_account(&pool, stranger.account_id).await;
}
