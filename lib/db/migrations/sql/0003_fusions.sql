-- Sprint 3: splitters + fusiones + estado de fibra + triggers.

-- ============ fn_sync_fusion_endpoints ============
-- Mantiene fusion_endpoints con una fila por endpoint de cada fusion.
-- UNIQUE parcial sobre fiber_id / splitter_port_id garantiza que un extremo
-- no pueda participar en dos fusiones simultáneas.
CREATE OR REPLACE FUNCTION fn_sync_fusion_endpoints() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Borrar filas previas de esta fusion (en UPDATE podrían haber cambiado)
    DELETE FROM fusion_endpoints WHERE fusion_id = NEW.id;

    -- Insertar endpoint A
    INSERT INTO fusion_endpoints (fusion_id, organization_id, kind, fiber_id, splitter_port_id)
    VALUES (NEW.id, NEW.organization_id, NEW.endpoint_a_kind,
            NEW.endpoint_a_fiber_id, NEW.endpoint_a_splitter_port_id);

    -- Insertar endpoint B
    INSERT INTO fusion_endpoints (fusion_id, organization_id, kind, fiber_id, splitter_port_id)
    VALUES (NEW.id, NEW.organization_id, NEW.endpoint_b_kind,
            NEW.endpoint_b_fiber_id, NEW.endpoint_b_splitter_port_id);

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM fusion_endpoints WHERE fusion_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_fusion_endpoints ON fusions;
CREATE TRIGGER trg_sync_fusion_endpoints
  AFTER INSERT OR UPDATE OR DELETE ON fusions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_fusion_endpoints();

-- ============ fn_set_fiber_status_on_fusion ============
-- Mueve fibras a 'fused' al insertar una fusión; las devuelve a 'free' al borrarla
-- (salvo que estén en otra fusión — protegido por UNIQUE en fusion_endpoints).
CREATE OR REPLACE FUNCTION fn_set_fiber_status_on_fusion() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.endpoint_a_fiber_id IS NOT NULL THEN
      UPDATE fibers SET status = 'fused' WHERE id = NEW.endpoint_a_fiber_id AND status = 'free';
    END IF;
    IF NEW.endpoint_b_fiber_id IS NOT NULL THEN
      UPDATE fibers SET status = 'fused' WHERE id = NEW.endpoint_b_fiber_id AND status = 'free';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.endpoint_a_fiber_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM fusion_endpoints fe WHERE fe.fiber_id = OLD.endpoint_a_fiber_id) THEN
      UPDATE fibers SET status = 'free' WHERE id = OLD.endpoint_a_fiber_id AND status = 'fused';
    END IF;
    IF OLD.endpoint_b_fiber_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM fusion_endpoints fe WHERE fe.fiber_id = OLD.endpoint_b_fiber_id) THEN
      UPDATE fibers SET status = 'free' WHERE id = OLD.endpoint_b_fiber_id AND status = 'fused';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- OJO al orden: sync_fusion_endpoints corre AFTER INSERT (alfabéticamente va antes
-- que set_fiber_status). Postgres ejecuta triggers AFTER en orden alfabético del nombre.
-- Aquí queremos sync antes (para que el DELETE en set_fiber_status pueda consultar
-- fusion_endpoints ya actualizada). Usamos nombre `trg_a_...` y `trg_b_...` para forzar orden.
DROP TRIGGER IF EXISTS trg_b_set_fiber_status ON fusions;
CREATE TRIGGER trg_b_set_fiber_status
  AFTER INSERT OR DELETE ON fusions
  FOR EACH ROW EXECUTE FUNCTION fn_set_fiber_status_on_fusion();

-- Renombrar sync trigger si existe sin prefijo para respetar orden:
DROP TRIGGER IF EXISTS trg_sync_fusion_endpoints ON fusions;
CREATE TRIGGER trg_a_sync_fusion_endpoints
  AFTER INSERT OR UPDATE OR DELETE ON fusions
  FOR EACH ROW EXECUTE FUNCTION fn_sync_fusion_endpoints();

-- ============ fn_generate_splitter_ports ============
-- Cuando se inserta un splitter, auto-genera los puertos (1 input + N outputs).
CREATE OR REPLACE FUNCTION fn_generate_splitter_ports() RETURNS TRIGGER AS $$
DECLARE
  num_outputs int;
  i int;
BEGIN
  num_outputs := CASE NEW.ratio
    WHEN '1x2'  THEN 2
    WHEN '1x4'  THEN 4
    WHEN '1x8'  THEN 8
    WHEN '1x16' THEN 16
    WHEN '1x32' THEN 32
    WHEN '1x64' THEN 64
    ELSE 0
  END;

  -- 1 input en port_number 0
  INSERT INTO splitter_ports (organization_id, splitter_id, kind, port_number)
  VALUES (NEW.organization_id, NEW.id, 'input', 0);

  -- N outputs numerados 1..N
  FOR i IN 1..num_outputs LOOP
    INSERT INTO splitter_ports (organization_id, splitter_id, kind, port_number)
    VALUES (NEW.organization_id, NEW.id, 'output', i);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_splitter_generate_ports ON splitters;
CREATE TRIGGER trg_splitter_generate_ports
  AFTER INSERT ON splitters
  FOR EACH ROW EXECUTE FUNCTION fn_generate_splitter_ports();

-- ============ Version bump en splitters y fusions ============
DROP TRIGGER IF EXISTS trg_splitters_version ON splitters;
CREATE TRIGGER trg_splitters_version
  BEFORE UPDATE ON splitters
  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();

DROP TRIGGER IF EXISTS trg_fusions_version ON fusions;
CREATE TRIGGER trg_fusions_version
  BEFORE UPDATE ON fusions
  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();

-- ============ Audit triggers ============
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['splitters','splitter_ports','fusions']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON %I; '
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============ RLS ============
ALTER TABLE splitters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_splitters ON splitters;
CREATE POLICY tenant_isolation_splitters ON splitters
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE splitter_ports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_splitter_ports ON splitter_ports;
CREATE POLICY tenant_isolation_splitter_ports ON splitter_ports
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE fusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fusions ON fusions;
CREATE POLICY tenant_isolation_fusions ON fusions
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

ALTER TABLE fusion_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fusion_endpoints ON fusion_endpoints;
CREATE POLICY tenant_isolation_fusion_endpoints ON fusion_endpoints
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

COMMENT ON FUNCTION fn_sync_fusion_endpoints() IS 'Sprint 3 · sincroniza fusion_endpoints para enforcement de UNIQUE por extremo';
COMMENT ON FUNCTION fn_set_fiber_status_on_fusion() IS 'Sprint 3 · marca fibras como fused/free al crear/borrar fusiones';
COMMENT ON FUNCTION fn_generate_splitter_ports() IS 'Sprint 3 · autogenera input + N outputs según ratio';
