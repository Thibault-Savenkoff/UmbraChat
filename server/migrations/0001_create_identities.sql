CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_keys (
    account_id UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    public_key BYTEA NOT NULL,
    registration_id INTEGER NOT NULL
);

CREATE TABLE signed_prekeys (
    account_id UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    signature BYTEA NOT NULL
);

CREATE TABLE prekeys (
    account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (account_id, key_id)
);
