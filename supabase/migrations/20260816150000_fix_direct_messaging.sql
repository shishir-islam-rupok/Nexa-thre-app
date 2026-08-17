-- Create direct conversations atomically so RLS never exposes a partially-created chat.
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(other_user_id uuid)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot start a conversation with yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = other_user_id) THEN
    RAISE EXCEPTION 'Recipient does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(least(auth.uid()::text, other_user_id::text) || ':' || greatest(auth.uid()::text, other_user_id::text)));

  SELECT cp.conversation_id
  INTO conversation_id
  FROM conversation_participants cp
  WHERE cp.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM conversation_participants other_cp
      WHERE other_cp.conversation_id = cp.conversation_id
        AND other_cp.user_id = other_user_id
    )
  ORDER BY cp.created_at
  LIMIT 1;

  IF conversation_id IS NULL THEN
    INSERT INTO conversations DEFAULT VALUES RETURNING conversations.id INTO conversation_id;
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES (conversation_id, auth.uid()), (conversation_id, other_user_id);
  END IF;

  RETURN QUERY
  SELECT conversations.id, conversations.created_at
  FROM conversations
  WHERE conversations.id = conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

-- Keep content edits limited to the sender. Read receipts are updated through the
-- narrowly scoped function below, rather than granting recipients broad UPDATE access.
DROP POLICY IF EXISTS "msg_update_participant" ON messages;
DROP POLICY IF EXISTS "msg_update_sender" ON messages;
CREATE POLICY "msg_update_sender" ON messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.mark_conversation_read(target_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = target_conversation_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Conversation access denied';
  END IF;

  UPDATE messages
  SET read_at = now()
  WHERE conversation_id = target_conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;
