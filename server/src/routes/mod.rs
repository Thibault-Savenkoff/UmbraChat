mod register;

use axum::{routing::post, Router};
use sqlx::PgPool;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/v1/register", post(register::register))
        .with_state(pool)
}
