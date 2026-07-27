# Review: Account & device identity creation

- **Verdict**: approve
- **Diff**: `main...feat/identity-creation`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Server: registration API + schema

- [x] `cargo run` starts the server and connects to Postgres without error — `server/src/main.rs:1-13`, verified by a live run (`listening on 0.0.0.0:3000`)
- [x] Migration runs cleanly; no column stores anything private-key-shaped — `server/migrations/0001_create_identities.sql:1-25` (only `public_key`, `signature`, `registration_id`, `used`, `created_at`, `id`)
- [x] Valid bundle → 201 with account id; invalid signature → 4xx, nothing persisted — `server/tests/register.rs`, 3 tests pass (adds a too-many-prekeys case)

### Phase 2 — WASM crypto wrapper

- [x] `cargo build --target wasm32-unknown-unknown` succeeds — `wasm-crypto/Cargo.toml`, `wasm-crypto/.cargo/config.toml`
- [x] `wasm-pack build --target web` succeeds, emits `pkg/` — build config present and verified at implementation time (`pkg/` itself is gitignored, a build artifact)
- [x] JS call returns non-empty identity key, signed prekey + signature, ≥1 one-time prekey, no throw — `wasm-crypto/smoketest.cjs:1-22`, 7/7 checks pass

### Phase 3 — Web client identity generation + registration UI

- [x] `npm run dev` serves the app, `wasm-crypto` initializes with no console error — `web/e2e-smoketest.mjs`
- [x] Reload reuses the existing identity instead of regenerating — `web/src/App.tsx`, `web/e2e-smoketest.mjs`
- [x] Safety Number screen shows a non-empty fingerprint **and** the server's `identity_keys` table has exactly one new row with only public-key bytes — now both automated in `web/e2e-smoketest.mjs` (queries Postgres directly via `pg`, asserts row count +1 and a 33-byte public key)

## Findings

None.

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (9/9)                                         |
| Files checked | `server/src/main.rs`, `server/migrations/0001_create_identities.sql`, `server/src/routes/register.rs`, `server/tests/register.rs`, `wasm-crypto/src/lib.rs`, `wasm-crypto/smoketest.cjs`, `web/src/App.tsx`, `web/src/storage/keyStore.ts`, `web/e2e-smoketest.mjs` |
| Unchecked     | none |
| Unplanned     | CORS layer on `server/src/routes/mod.rs` (real cross-origin bug found while building phase 3); `one_time_prekeys` length cap and its test on `server/src/routes/register.rs` (from this review's fix pass) |

### Fix pass notes

- Applied all 4 findings from the previous review: DB-effect assertion added to the e2e test, integration tests now clean up their rows (verified before/after account-id sets are identical across a run), `App.tsx` state made an explicit discriminated union, and `one_time_prekeys` capped at 100 with a dedicated test.
- Caught and fixed a real bug introduced while writing the fix for the first finding: the new e2e DB check ordered by `account_id DESC` to find the latest row, but `account_id` is a random UUID (`gen_random_uuid()`), not sequential — that never reliably picks the most recent row. Fixed by joining on `accounts.created_at` instead. Re-verified after the fix: 7/7 e2e checks still pass.
