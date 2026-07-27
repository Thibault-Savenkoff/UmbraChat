// Run: wasm-pack build --target nodejs --out-dir pkg-node-smoketest && node smoketest.cjs
const { generate_identity_bundle, sign_with_identity } = require("./pkg-node-smoketest/wasm_crypto.js");

const bundle = generate_identity_bundle(5);

const signature = sign_with_identity(bundle.identity_private_key, new TextEncoder().encode("POST\n/v1/messages\n1234567890\nabc"));

const checks = [
  ["identity_public_key non-empty", bundle.identity_public_key.length > 0],
  ["identity_private_key non-empty", bundle.identity_private_key.length > 0],
  ["registration_id is a number", typeof bundle.registration_id === "number"],
  ["signed_prekey.public_key non-empty", bundle.signed_prekey.public_key.length > 0],
  ["signed_prekey.signature non-empty", bundle.signed_prekey.signature.length > 0],
  ["kyber_signed_prekey.public_key non-empty", bundle.kyber_signed_prekey.public_key.length > 0],
  ["kyber_signed_prekey.signature non-empty", bundle.kyber_signed_prekey.signature.length > 0],
  ["one_time_prekeys has 5 entries", bundle.one_time_prekeys.length === 5],
  ["each one_time_prekey has a public_key", bundle.one_time_prekeys.every((k) => k.public_key.length > 0)],
  ["sign_with_identity produces a 64-byte signature", signature.length === 64, `length=${signature.length}`],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
