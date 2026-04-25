-- Sprint 5: PWA offline field sync + files.

-- RLS en field_sync_queue
ALTER TABLE field_sync_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_field_sync ON field_sync_queue;
CREATE POLICY tenant_isolation_field_sync ON field_sync_queue
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- RLS en files
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_files ON files;
CREATE POLICY tenant_isolation_files ON files
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- Audit sobre files (no sobre field_sync_queue: es registro de operaciones, no entidad de dominio)
DROP TRIGGER IF EXISTS trg_audit_files ON files;
CREATE TRIGGER trg_audit_files
  AFTER INSERT OR UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

COMMENT ON TABLE field_sync_queue IS 'Sprint 5 · cola de mutaciones offline con client_uuid y resolución LWW';
COMMENT ON TABLE files IS 'Sprint 5 · metadata de archivos en object storage (R2/MinIO)';
