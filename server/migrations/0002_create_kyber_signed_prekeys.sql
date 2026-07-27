CREATE TABLE kyber_signed_prekeys (
    account_id UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    signature BYTEA NOT NULL
);
