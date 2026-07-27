# AI Operating Guidelines

How this team drives AI coding assistants on this project. Keep it short and specific to this repo. Fill the placeholders, drop what does not apply.

## House rules

- Never hand-roll cryptography. All encryption goes through the official `libsignal-client` bindings (Rust/Swift/Kotlin/WASM) — no custom crypto primitives, even for "small" pieces.
- The server must stay zero-knowledge: it stores and relays encrypted envelopes and public prekey bundles only. Any change that would let the server read plaintext content is a blocker, not a review comment.
- No paid tech, no paid services, ever — the project runs at $0/month permanently. Flag any dependency or hosting choice that isn't free before adding it.

For the general AIDD playbook (planning, review loops, prompting and context hygiene, anti-patterns), see the framework docs: <https://github.com/ai-driven-dev/framework>.
