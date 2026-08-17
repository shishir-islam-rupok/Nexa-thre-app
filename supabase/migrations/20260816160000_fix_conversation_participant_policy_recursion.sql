-- Avoid querying conversation_participants from its own RLS policies.
-- This function executes as the migration owner, which bypasses RLS, while
-- auth.uid() still refers to the authenticated caller.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(target_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = target_conversation_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "cp_read_participant" ON conversation_participants;
CREATE POLICY "cp_read_participant" ON conversation_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_conversation_participant(conversation_id)
  );

-- Direct conversations are created only by get_or_create_direct_conversation,
-- which inserts both participant rows atomically as a security-definer function.
DROP POLICY IF EXISTS "cp_insert_own_or_conv" ON conversation_participants;
DROP POLICY IF EXISTS "cp_insert_via_direct_conversation" ON conversation_participants;
CREATE POLICY "cp_insert_via_direct_conversation" ON conversation_participants FOR INSERT TO authenticated
  WITH CHECK (false);
