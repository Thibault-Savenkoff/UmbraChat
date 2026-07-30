CREATE TABLE push_subscriptions (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
