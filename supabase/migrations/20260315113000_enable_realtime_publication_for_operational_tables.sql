do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'academic_notes',
    'account_audit_logs',
    'assessment_results',
    'assessments',
    'attendance_records',
    'billing_sync_sources',
    'campuses',
    'cohort_assignments',
    'cohorts',
    'enrollments',
    'families',
    'intake_import_runs',
    'intake_sync_sources',
    'invoices',
    'leads',
    'message_posts',
    'message_threads',
    'profiles',
    'programs',
    'resources',
    'sessions',
    'students',
    'sync_jobs',
    'terms',
    'user_templates'
  ];
begin
  foreach realtime_table in array realtime_tables loop
    if exists (
      select 1
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and pg_class.relname = realtime_table
        and pg_class.relkind = 'r'
    ) and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end
$$;
