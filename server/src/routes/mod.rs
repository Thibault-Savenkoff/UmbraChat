mod devices;
mod messages;
mod prekey_bundle;
mod register;

use axum::{
    http::Method,
    routing::{delete, get, post},
    Router,
};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};

pub fn router(pool: PgPool) -> Router {
    // Registration and device-linking are public, unauthenticated endpoints with
    // no cookies/credentials involved, so a permissive CORS policy is fine.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers(Any);

    Router::new()
        .route("/v1/register", post(register::register))
        .route("/v1/devices/{id}/prekey-bundle", get(prekey_bundle::get_prekey_bundle))
        .route("/v1/devices/{id}", delete(devices::unlink_device))
        .route("/v1/accounts/{id}/devices", get(devices::list_devices).post(devices::complete_link))
        .route("/v1/accounts/{id}/devices/link-init", post(devices::link_init))
        .route("/v1/messages", post(messages::send_message).get(messages::fetch_messages))
        .layer(cors)
        .with_state(pool)
}
