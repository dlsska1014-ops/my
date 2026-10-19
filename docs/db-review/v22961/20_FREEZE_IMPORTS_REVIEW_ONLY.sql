-- REVIEW ONLY. Retain every new RPC, trigger and state record during recovery.
BEGIN;
DO $review_only$ BEGIN
  RAISE EXCEPTION 'v61_review_only_recovery_freeze_approval_required';
END $review_only$;
-- An additional operator-approved DB freeze can revoke NEW commits, not restore old RPCs.
REVOKE EXECUTE ON FUNCTION public.accountbook_commit_import_v22960(uuid,jsonb,text,text) FROM service_role;
-- Source reconciliation and guarded purge stay available to the compatible recovery Worker.
-- Already-started SQL is not cancelled by a later privilege change.
NOTIFY pgrst, 'reload schema';
COMMIT;
