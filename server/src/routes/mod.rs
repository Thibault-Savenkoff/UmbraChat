mod messages;
mod prekey_bundle;
mod register;

use axum::{
    http::Method,
    routing::{get, post},
    Router,
};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};

pub fn router(pool: PgPool) -> Router {
    // Registration is a public, unauthenticated endpoint with no cookies/credentials
    // involved, so a permissive CORS policy is fine; revisit once other routes need auth.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    Router::new()
        .route("/v1/register", post(register::register))
        .route("/v1/accounts/{id}/prekey-bundle", get(prekey_bundle::get_prekey_bundle))
        .route("/v1/messages", post(messages::send_message).get(messages::fetch_messages))
        .layer(cors)
        .with_state(pool)
}
