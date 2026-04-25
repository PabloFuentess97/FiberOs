-- Sprint 4: clientes + trigger version + audit + RLS + ts_vector para búsqueda global.

-- Índice GIST sobre location (clientes con coordenadas)
CREATE INDEX IF NOT EXISTS clients_geom_idx ON clients USING GIST (location)
  WHERE deleted_at IS NULL;

-- Version bump
DROP TRIGGER IF EXISTS trg_clients_version ON clients;
CREATE TRIGGER trg_clients_version
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_bump_version();

-- Audit trigger
DROP TRIGGER IF EXISTS trg_audit_clients ON clients;
CREATE TRIGGER trg_audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_clients ON clients;
CREATE POLICY tenant_isolation_clients ON clients
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- ============ Búsqueda global con ts_vector ============
-- Columna generada + índice GIN para cmd+K (boxes, cables, clients).

-- boxes: buscamos por code, address, notes
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(code,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(short_id,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(address,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(notes,'')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS boxes_search_idx ON boxes USING GIN (search_tsv);

-- cables: code, notes
ALTER TABLE cables
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(code,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(notes,'')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS cables_search_idx ON cables USING GIN (search_tsv);

-- clients: name, external_code, document_id, phone, email, ont_serial, address
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(external_code,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(document_id,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(phone,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(email,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ont_serial,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(address,'')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS clients_search_idx ON clients USING GIN (search_tsv);

COMMENT ON COLUMN boxes.search_tsv IS 'Sprint 4 · búsqueda global con to_tsvector + GIN';
COMMENT ON COLUMN cables.search_tsv IS 'Sprint 4 · búsqueda global';
COMMENT ON COLUMN clients.search_tsv IS 'Sprint 4 · búsqueda global';
