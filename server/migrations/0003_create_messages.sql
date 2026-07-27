CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    recipient_account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    ciphertext BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_recipient_idx ON messages (recipient_account_id);
