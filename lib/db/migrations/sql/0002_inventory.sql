-- Sprint 2: GIST indices, short_id generator, RLS, audit triggers, colores TIA-598-C.
-- Se aplica después de `pnpm db:push` cada vez que se modifica el schema Drizzle.

-- ============ GIST indices (no soportados por drizzle-kit directamente) ============
CREATE INDEX IF NOT EXISTS boxes_geom_idx ON boxes USING GIST (location);
CREATE INDEX IF NOT EXISTS cables_path_idx ON cables USING GIST (path);

-- ============ Short ID generator (8 chars [A-Z0-9], colisión resuelta con retry) ============
CREATE OR REPLACE FUNCTION fn_generate_short_id() RETURNS text AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sin I, O, 0, 1 para legibilidad
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, (floor(random() * length(alphabet)))::int + 1, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_boxes_set_short_id() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.short_id IS NULL OR NEW.short_id = '' THEN
    LOOP
      NEW.short_id := fn_generate_short_id();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM boxes
         WHERE organization_id = NEW.organization_id AND short_id = NEW.short_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boxes_set_short_id ON boxes;
CREATE TRIGGER trg_boxes_set_short_id
  BEFORE INSERT ON boxes
  FOR EACH ROW EXECUTE FUNCTION fn_boxes_set_short_id();

-- ============ Version bump on update (para LWW PWA) ============
CREATE OR REPLACE FUNCTION fn_bump_version() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.version IS NOT DISTINCT FROM OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boxes_version ON boxes;
CREATE TRIGGER trg_boxes_version
  BEFORE UPDATE ON boxes
  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();

DROP TRIGGER IF EXISTS trg_cables_touch ON cables;
CREATE TRIGGER trg_cables_touch
  BEFORE UPDATE ON cables
  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();

-- ============ Audit triggers ============
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['boxes','trays','cables','fibers']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON %I; '
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============ RLS + políticas ============
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_boxes ON boxes;
CREATE POLICY tenant_isolation_boxes ON boxes
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE trays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_trays ON trays;
CREATE POLICY tenant_isolation_trays ON trays
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE cables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cables ON cables;
CREATE POLICY tenant_isolation_cables ON cables
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE fibers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fibers ON fibers;
CREATE POLICY tenant_isolation_fibers ON fibers
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

COMMENT ON FUNCTION fn_generate_short_id() IS 'Sprint 2 · 8 chars alfabeto sin ambiguos';
COMMENT ON FUNCTION fn_bump_version() IS 'Sprint 2 · incrementa version en UPDATE si cliente no la cambió';
