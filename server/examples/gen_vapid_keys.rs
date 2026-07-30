//! One-off VAPID keypair generator - run once via `cargo run --example gen_vapid_keys`,
//! save the private key to the server's VAPID_PRIVATE_KEY env var and the
//! public key to the client's VITE_VAPID_PUBLIC_KEY. Not part of the running
//! server; reuses the web-push/jwt-simple crates already a dependency rather
//! than pulling in separate key-generation tooling.
use ct_codecs::{Base64UrlSafeNoPadding, Encoder};
use jwt_simple::prelude::*;
use web_push::VapidSignatureBuilder;

fn main() {
    let keypair = ES256KeyPair::generate();
    let private_b64 = Base64UrlSafeNoPadding::encode_to_string(keypair.to_bytes()).unwrap();

    // VapidKey (which owns public_key()) isn't a public export of web_push -
    // round-trip through the builder instead, which does expose it.
    let builder = VapidSignatureBuilder::from_base64_no_sub(&private_b64).unwrap();
    let public_b64 = Base64UrlSafeNoPadding::encode_to_string(builder.get_public_key()).unwrap();

    println!("VAPID_PRIVATE_KEY={private_b64}");
    println!("VITE_VAPID_PUBLIC_KEY={public_b64}");
}
