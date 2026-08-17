/*
# Add attachment_url to messages

1. Modified Tables
- `messages`: add `attachment_url` (text, nullable) — stores the public URL of an uploaded file (image, document, etc.) attached to a message.
2. Notes
- The column is nullable so existing messages are unaffected.
- No RLS changes needed — existing message policies already govern access.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE messages ADD COLUMN attachment_url text;
  END IF;
END $$;
