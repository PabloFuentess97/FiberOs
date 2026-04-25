-- Sprint 9: 2FA TOTP storage.
-- No aplicamos RLS: cada fila está unívocamente ligada a un user_id
-- y los queries viven bajo getCurrentSession() que ya valida identidad.
-- Sí auditamos cambios por seguridad.

DROP TRIGGER IF EXISTS trg_audit_user_two_factor ON user_two_factor;
CREATE TRIGGER trg_audit_user_two_factor
  AFTER INSERT OR UPDATE OR DELETE ON user_two_factor
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_backup_codes ON backup_codes;
CREATE TRIGGER trg_audit_backup_codes
  AFTER INSERT OR UPDATE OR DELETE ON backup_codes
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

COMMENT ON TABLE user_two_factor IS 'Sprint 9 · TOTP secret cifrado (AES-256-GCM) + timestamps';
COMMENT ON TABLE backup_codes IS 'Sprint 9 · códigos single-use (10 por usuario, SHA-256 hash)';
