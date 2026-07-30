---
status: blocked
---

# Instruction: WebAuthn/biometric unlock (stretch)

> Explicitly a stretch phase (see plan Decisions). Ship phases 1-3 as a complete, working feature first - this is a friendlier *alternative* to the passphrase, never a replacement for it, since WebAuthn PRF support isn't universal.

## Architecture projection

```txt
.
└── web/src/
    ├── crypto/
    │   └── vault.ts ✏️ add enableBiometric(), unlockWithBiometric() - alongside, not replacing, the passphrase path
    ├── screens/
    │   ├── Settings.tsx ✏️ offer "Use Face ID / fingerprint instead" when supported
    │   └── Unlock.tsx ✏️ offer a biometric prompt button when this device registered one
```

## Feasibility check result (2026-07-30)

Ran `PublicKeyCredential.getClientCapabilities()` against the dev Chromium: `PublicKeyCredential` exists, `getClientCapabilities` exists, and `extension:prf` reports `true` - the client-side API surface needed is present in a modern evergreen browser. But `userVerifyingPlatformAuthenticator` and `isUserVerifyingPlatformAuthenticatorAvailable()` both report `false` in this headless Linux dev environment, because there's no real Face ID/Touch ID/fingerprint hardware here to register a credential against - completing an actual registration ceremony isn't possible from this machine at all, and there's no way to drive the user's real iPhone from here either.

**Blocked per this project's own `blocked.md` criteria: "human login (Google OAuth, Apple Face/Touch ID)" is an explicitly named condition only a human can unblock** - this needs to be verified live on the user's own device, not guessed at or shipped blind. Filed as a separate follow-up issue rather than blocking the rest of this plan, since phases 1-3 already deliver the plan's full stated objective (WebAuthn was always an alternative, never a requirement).

## Tasks to do (deferred to the follow-up issue)

### `1)` Feasibility check - do this before writing any implementation

> Named explicitly per this project's own discipline: verify against real behavior, don't assume a spec is implemented the way it's documented.

1. Confirm `PublicKeyCredential.prf` extension support (feature-detect via `PublicKeyCredential.getClientCapabilities?.()` or a `create()` attempt with the extension requested) in whatever real browsers this app is actually tested against. If it's unsupported or inconsistent enough to be more confusing than helpful, stop here and close this phase as "not viable yet" rather than shipping a half-working biometric prompt.

### `2)` Registration and unlock, if the feasibility check passes

1. `enableBiometric()`: `navigator.credentials.create()` with the `prf` extension and a fixed app-specific salt, store the resulting credential ID (not secret, just an identifier) in `localStorage`. The PRF output becomes the AES-GCM key material directly (or via HKDF) - same `EncryptedBlob` format phase 1 already defined, no new storage schema.
2. `unlockWithBiometric()`: `navigator.credentials.get()` against the stored credential ID with the same salt, derive the key the same way, verify via the same `loadAccount`-as-verify-callback pattern phase 3 already established.
3. This is additive to a passphrase that must already exist (from phase 2) - biometric unlock derives access to the *same* vault, it doesn't create a second independent one. If biometric auth ever fails or isn't available on a given device, the passphrase must still work as the fallback.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 1... | A documented, verified answer (not an assumption) on whether PRF extension support is viable in the target browsers, before any further code is written |
| 2... | If pursued: unlocking via biometric and unlocking via the original passphrase both succeed against the same vault, independently |
