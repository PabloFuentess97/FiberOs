-- Sprint 6: import_jobs con RLS (no audit — el propio job es la auditoría).

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_import_jobs ON import_jobs;
CREATE POLICY tenant_isolation_import_jobs ON import_jobs
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

COMMENT ON TABLE import_jobs IS 'Sprint 6 · trabajos de importación Excel con mapeo flexible y dry-run';
