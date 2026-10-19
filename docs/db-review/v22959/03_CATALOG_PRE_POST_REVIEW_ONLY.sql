-- REVIEW ONLY. NOT EXECUTED. Separate approval and current-catalog review are required.
SELECT p.oid::regprocedure AS signature, md5(replace(pg_get_functiondef(p.oid), chr(13) || chr(10), chr(10))) AS definition_md5_lf,
       pg_get_userbyid(p.proowner) AS owner_name, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
  FROM pg_proc p WHERE p.oid = 'public.accountbook_mutate_payment_assets_v2280(uuid,text,jsonb,text,text)'::regprocedure;
-- Expected pre MD5: 95a2842401a677f918455a982c44487d
-- Expected post MD5: 31a2c7008b2a6d63dbab515b1b86e2ae
-- owner=postgres, SECURITY DEFINER, volatile, search_path=public, pg_temp;
-- anon/authenticated=false, service_role=true; ACL must remain unchanged.
