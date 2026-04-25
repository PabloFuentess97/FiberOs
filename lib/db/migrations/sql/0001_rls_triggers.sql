-- Sprint 1: extensiones, trigger slug reservado, audit genérico, RLS.
-- Este fichero se aplica como paso manual antes de `pnpm db:push` (dev)
-- o integrado en el pipeline de migraciones (prod). Ver scripts/apply-sql.ts.

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============ TRIGGER: slug reservado ============
CREATE OR REPLACE FUNCTION check_org_slug_reserved() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug = ANY (ARRAY[
    'app','www','api','admin','docs','status','blog','mail','ftp',
    'cdn','static','assets','help','support','marketing','platform',
    'super-admin','auth','dashboard','billing','settings','onboarding'
  ]) THEN
    RAISE EXCEPTION 'slug reservado: %', NEW.slug USING ERRCODE = '23514';
  END IF;
  IF NEW.slug !~ '^[a-z0-9][a-z0-9-]{2,29}$' THEN
    RAISE EXCEPTION 'slug inválido: %', NEW.slug USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_org_slug ON organizations;
CREATE TRIGGER trg_check_org_slug
  BEFORE INSERT OR UPDATE OF slug ON organizations
  FOR EACH ROW EXECUTE FUNCTION check_org_slug_reserved();

-- ============ AUDIT TRIGGER ============
-- Inserta fila en audit_log con el diff JSONB. Lee context transaccional.
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_user uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_org  uuid := NULLIF(current_setting('app.organization_id', true), '')::uuid;
  v_imp  uuid := NULLIF(current_setting('app.acted_as_by', true), '')::uuid;
  v_diff jsonb;
  v_rid  uuid;
  v_org_row uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_diff := jsonb_build_object('new', to_jsonb(NEW));
    v_rid  := (to_jsonb(NEW)->>'id')::uuid;
    v_org_row := COALESCE(v_org, (to_jsonb(NEW)->>'organization_id')::uuid);
  ELSIF TG_OP = 'UPDATE' THEN
    v_diff := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_rid  := (to_jsonb(NEW)->>'id')::uuid;
    v_org_row := COALESCE(v_org, (to_jsonb(NEW)->>'organization_id')::uuid);
  ELSE
    v_diff := jsonb_build_object('old', to_jsonb(OLD));
    v_rid  := (to_jsonb(OLD)->>'id')::uuid;
    v_org_row := COALESCE(v_org, (to_jsonb(OLD)->>'organization_id')::uuid);
  END IF;

  IF v_org_row IS NULL THEN
    RETURN COALESCE(NEW, OLD);  -- no auditamos filas sin organización
  END IF;

  INSERT INTO audit_log (
    organization_id, user_id, acted_as_by, table_name, record_id, action, diff
  ) VALUES (
    v_org_row, v_user, v_imp, TG_TABLE_NAME, v_rid, LOWER(TG_OP)::audit_action, v_diff
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con organization_id.
-- En Sprints posteriores se añaden boxes, cables, fibers, splitters, fusions, clients.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','tenant_domains','tenant_branding','invitations']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_%I ON %I; '
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ============ ROW LEVEL SECURITY ============
-- Habilitamos RLS en tablas de dominio. La política compara el organization_id con el setting.
-- IMPORTANTE: requiere pooler en modo SESSION para que SET LOCAL persista dentro de la tx.

-- tenant_domains
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_domains ON tenant_domains;
CREATE POLICY tenant_isolation_tenant_domains ON tenant_domains
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- tenant_branding
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_branding ON tenant_branding;
CREATE POLICY tenant_isolation_tenant_branding ON tenant_branding
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_invitations ON invitations;
CREATE POLICY tenant_isolation_invitations ON invitations
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- organization_members: visible si el user es miembro (no filtramos por org para select-organization)
-- Se deja SIN RLS agresivo aquí porque la lectura necesita listar todas las orgs del user.
-- El filtro se hace explícito en las queries (y RLS cubre tablas de dominio).

-- audit_log: lectura filtrada por organization_id; inserción sólo via trigger (no expuesta a la app).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit_log ON audit_log;
CREATE POLICY tenant_isolation_audit_log ON audit_log
  FOR SELECT
  USING (organization_id = current_setting('app.organization_id', true)::uuid);
-- Permitimos inserción sin match porque el trigger corre como owner; con FORCE RLS también aplicaría.
DROP POLICY IF EXISTS audit_log_insert_any ON audit_log;
CREATE POLICY audit_log_insert_any ON audit_log
  FOR INSERT
  WITH CHECK (true);

-- organizations: RLS no activada (los usuarios deben poder listar sus orgs). El filtro va por membership.

COMMENT ON FUNCTION fn_audit_trigger() IS 'Sprint 1 · escribe audit_log para tablas con organization_id';
COMMENT ON FUNCTION check_org_slug_reserved() IS 'Sprint 1 · bloquea slugs reservados y formato inválido';
