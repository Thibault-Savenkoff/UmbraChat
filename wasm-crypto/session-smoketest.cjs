// Run: wasm-pack build --target nodejs --out-dir pkg-node-smoketest && node session-smoketest.cjs
const { generate_identity_bundle, SignalStore } = require("./pkg-node-smoketest/wasm_crypto.js");

const checks = [];
function check(label, ok, detail) {
  checks.push([label, ok, detail]);
}

// Two independently generated identities, exactly as issue #1's registration flow does.
const aliceBundle = generate_identity_bundle(1);
const bobBundle = generate_identity_bundle(1);

const aliceStore = new SignalStore(aliceBundle);
const bobStore = new SignalStore(bobBundle);

// Bob's bundle as the server's prekey-bundle endpoint would shape it: no private keys,
// one_time_prekey singular (the server hands out at most one).
const bobPublicBundle = {
  identity_public_key: bobBundle.identity_public_key,
  registration_id: bobBundle.registration_id,
  signed_prekey: {
    key_id: bobBundle.signed_prekey.key_id,
    public_key: bobBundle.signed_prekey.public_key,
    signature: bobBundle.signed_prekey.signature,
  },
  kyber_signed_prekey: {
    key_id: bobBundle.kyber_signed_prekey.key_id,
    public_key: bobBundle.kyber_signed_prekey.public_key,
    signature: bobBundle.kyber_signed_prekey.signature,
  },
  one_time_prekey: {
    key_id: bobBundle.one_time_prekeys[0].key_id,
    public_key: bobBundle.one_time_prekeys[0].public_key,
  },
};

check("alice has no session with bob before establishing one", aliceStore.has_session("bob") === false);

aliceStore.establish_session("bob", bobPublicBundle);
check("alice has a session with bob after establishing one", aliceStore.has_session("bob") === true);

const plaintext1 = new TextEncoder().encode("hello bob, this is alice");
const envelope1 = aliceStore.encrypt("bob", plaintext1);
check("first envelope is type 3 (prekey message)", envelope1[0] === 3, `type byte=${envelope1[0]}`);

// Bob never called establish_session - decrypting the first PreKeySignalMessage establishes it for him.
const decrypted1 = bobStore.decrypt("alice", envelope1);
const decryptedText1 = new TextDecoder().decode(decrypted1);
check("bob decrypts alice's first message correctly", decryptedText1 === "hello bob, this is alice", decryptedText1);
check("bob now has a session with alice", bobStore.has_session("alice") === true);

// A session only stops wrapping in prekey material once its owner has *decrypted*
// something back (that's what "acknowledges" it) - Bob just decrypted Alice's
// message, so his side is acknowledged immediately; Alice's stays unacknowledged
// until she decrypts a reply from Bob.
const reply = bobStore.encrypt("alice", new TextEncoder().encode("hi alice, bob here"));
check("bob's reply is type 2 (his session was acknowledged by decrypting alice's message)", reply[0] === 2, `type byte=${reply[0]}`);

const decryptedReply = new TextDecoder().decode(aliceStore.decrypt("bob", reply));
check("alice decrypts bob's reply correctly", decryptedReply === "hi alice, bob here", decryptedReply);

// Now that alice has decrypted a reply, her session is acknowledged too.
const plaintext2 = new TextEncoder().encode("second message, session now acknowledged");
const envelope2 = aliceStore.encrypt("bob", plaintext2);
check("alice's next message is type 2 (her session is now acknowledged)", envelope2[0] === 2, `type byte=${envelope2[0]}`);

const decrypted2 = bobStore.decrypt("alice", envelope2);
const decryptedText2 = new TextDecoder().decode(decrypted2);
check("bob decrypts alice's second message correctly", decryptedText2 === "second message, session now acknowledged", decryptedText2);

let failed = false;
for (const [label, ok, detail] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` (${detail})`}`);
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
