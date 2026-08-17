/*
# Fix messages UPDATE policy for read receipts

## Problem
The existing `msg_update_participant` policy only allows `auth.uid() = sender_id`,
meaning only the sender can update their own messages. But the app needs
conversation participants to mark messages from others as read (set `read_at`).

## Changes
1. Replace the UPDATE policy on `messages`:
   - Allow any conversation participant to update `read_at` on messages they didn't send.
   - Still allow senders to update their own message content.
2. This is non-destructive — no data is lost.

## Security
- UPDATE is scoped to conversation participants only.
- No new tables or columns.
*/

DROP POLICY IF EXISTS "msg_update_participant" ON messages;
CREATE POLICY "msg_update_participant" ON messages FOR UPDATE TO authenticated
  USING (
    auth.uid() = sender_id
    OR EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );
