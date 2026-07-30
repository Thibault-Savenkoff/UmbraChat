use umbrachat_server::{db, routes};

#[tokio::main]
async fn main() {
    let pool = db::connect().await;
    let vapid_private_key = std::env::var("VAPID_PRIVATE_KEY").expect("VAPID_PRIVATE_KEY must be set");
    let app = routes::router(pool, vapid_private_key);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .expect("failed to bind to port 3000");
    println!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.expect("server error");
}
