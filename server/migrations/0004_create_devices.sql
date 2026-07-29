CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every existing account gets one device row, reusing the account's own id as
-- the device id - the identity_keys/signed_prekeys/etc rows below (PK'd on
-- account_id) don't need to move, just have their FK column repointed.
INSERT INTO devices (id, account_id, label)
SELECT id, id, 'Primary' FROM accounts;

ALTER TABLE identity_keys RENAME COLUMN account_id TO device_id;
ALTER TABLE identity_keys DROP CONSTRAINT identity_keys_account_id_fkey;
ALTER TABLE identity_keys ADD CONSTRAINT identity_keys_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE;

ALTER TABLE signed_prekeys RENAME COLUMN account_id TO device_id;
ALTER TABLE signed_prekeys DROP CONSTRAINT signed_prekeys_account_id_fkey;
ALTER TABLE signed_prekeys ADD CONSTRAINT signed_prekeys_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE;

ALTER TABLE kyber_signed_prekeys RENAME COLUMN account_id TO device_id;
ALTER TABLE kyber_signed_prekeys DROP CONSTRAINT kyber_signed_prekeys_account_id_fkey;
ALTER TABLE kyber_signed_prekeys ADD CONSTRAINT kyber_signed_prekeys_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE;

ALTER TABLE prekeys RENAME COLUMN account_id TO device_id;
ALTER TABLE prekeys DROP CONSTRAINT prekeys_account_id_fkey;
ALTER TABLE prekeys ADD CONSTRAINT prekeys_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE;

ALTER TABLE messages RENAME COLUMN sender_account_id TO sender_device_id;
ALTER TABLE messages RENAME COLUMN recipient_account_id TO recipient_device_id;
ALTER TABLE messages DROP CONSTRAINT messages_sender_account_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_sender_device_id_fkey FOREIGN KEY (sender_device_id) REFERENCES devices (id) ON DELETE CASCADE;
ALTER TABLE messages DROP CONSTRAINT messages_recipient_account_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_recipient_device_id_fkey FOREIGN KEY (recipient_device_id) REFERENCES devices (id) ON DELETE CASCADE;
DROP INDEX messages_recipient_idx;
CREATE INDEX messages_recipient_idx ON messages (recipient_device_id);

-- Denormalized so the client's poll can filter "is this from my open
-- conversation's contact" without the server joining on every fetch.
ALTER TABLE messages ADD COLUMN sender_account_id UUID REFERENCES accounts (id) ON DELETE CASCADE;
UPDATE messages SET sender_account_id = (SELECT account_id FROM devices WHERE devices.id = messages.sender_device_id);
ALTER TABLE messages ALTER COLUMN sender_account_id SET NOT NULL;
