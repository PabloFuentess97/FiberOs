-- Sprint 7: billing + outbox + impersonations + plan quotas + domain triggers.

-- ============ RLS ============
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_subscriptions ON subscriptions;
CREATE POLICY tenant_isolation_subscriptions ON subscriptions
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- plan_quotas es global (no multi-tenant): sin RLS, solo super-admin puede editar
ALTER TABLE plan_quotas DISABLE ROW LEVEL SECURITY;

-- stripe_events: global (Stripe webhooks), sin RLS
ALTER TABLE stripe_events DISABLE ROW LEVEL SECURITY;

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
-- Para outbox permitimos lectura con o sin tenant (worker bypass via ROLE fibraos_worker con BYPASSRLS)
DROP POLICY IF EXISTS tenant_isolation_outbox ON outbox_events;
CREATE POLICY tenant_isolation_outbox ON outbox_events
  USING (
    organization_id IS NULL
    OR organization_id = current_setting('app.organization_id', true)::uuid
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = current_setting('app.organization_id', true)::uuid
  );

ALTER TABLE impersonations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_impersonations ON impersonations;
CREATE POLICY tenant_isolation_impersonations ON impersonations
  USING (organization_id = current_setting('app.organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);

-- ============ Audit ============
DROP TRIGGER IF EXISTS trg_audit_subscriptions ON subscriptions;
CREATE TRIGGER trg_audit_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

-- ============ Seed plan_quotas ============
INSERT INTO plan_quotas (plan, client_limit, user_limit, custom_domain_limit, api_rate_per_minute, import_rows_per_job)
VALUES
  ('trial',      100,    2,   0,   60,   5000),
  ('starter',    500,    3,   0,   120,  10000),
  ('pro',        5000,   10,  1,   300,  25000),
  ('business',   25000,  NULL, 3,  600,  100000),
  ('enterprise', NULL,   NULL, NULL, 1200, 500000)
ON CONFLICT (plan) DO UPDATE SET
  client_limit = EXCLUDED.client_limit,
  user_limit = EXCLUDED.user_limit,
  custom_domain_limit = EXCLUDED.custom_domain_limit,
  api_rate_per_minute = EXCLUDED.api_rate_per_minute,
  import_rows_per_job = EXCLUDED.import_rows_per_job;

-- ============ fn_check_plan_quotas ============
-- Antes de insertar cliente / member / custom domain, valida contra plan_quotas.
-- Soft-exception con código `plan_limit_exceeded` que la app captura y traduce.
CREATE OR REPLACE FUNCTION fn_check_plan_quotas() RETURNS TRIGGER AS $$
DECLARE
  plan_row plan_quotas%ROWTYPE;
  sub subscriptions%ROWTYPE;
  current_count int;
BEGIN
  SELECT * INTO sub FROM subscriptions WHERE organization_id = NEW.organization_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;  -- si no hay suscripción aún (alta), saltar enforcement
  END IF;
  SELECT * INTO plan_row FROM plan_quotas WHERE plan = sub.plan;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Clientes
  IF TG_TABLE_NAME = 'clients' AND TG_OP = 'INSERT' AND plan_row.client_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count FROM clients
      WHERE organization_id = NEW.organization_id AND deleted_at IS NULL;
    IF current_count >= plan_row.client_limit THEN
      RAISE EXCEPTION 'plan_limit_exceeded:clients:%', plan_row.client_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Usuarios (members)
  IF TG_TABLE_NAME = 'organization_members' AND TG_OP = 'INSERT' AND plan_row.user_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count FROM organization_members
      WHERE organization_id = NEW.organization_id;
    IF current_count >= plan_row.user_limit THEN
      RAISE EXCEPTION 'plan_limit_exceeded:users:%', plan_row.user_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Dominios custom (no subdominio)
  IF TG_TABLE_NAME = 'tenant_domains' AND TG_OP = 'INSERT' AND NEW.is_subdomain = false THEN
    SELECT COUNT(*) INTO current_count FROM tenant_domains
      WHERE organization_id = NEW.organization_id AND is_subdomain = false;
    IF current_count >= plan_row.custom_domain_limit THEN
      RAISE EXCEPTION 'plan_limit_exceeded:custom_domains:%', plan_row.custom_domain_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quota_clients ON clients;
CREATE TRIGGER trg_quota_clients
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION fn_check_plan_quotas();

DROP TRIGGER IF EXISTS trg_quota_members ON organization_members;
CREATE TRIGGER trg_quota_members
  BEFORE INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION fn_check_plan_quotas();

DROP TRIGGER IF EXISTS trg_quota_domains ON tenant_domains;
CREATE TRIGGER trg_quota_domains
  BEFORE INSERT ON tenant_domains
  FOR EACH ROW EXECUTE FUNCTION fn_check_plan_quotas();

COMMENT ON FUNCTION fn_check_plan_quotas() IS 'Sprint 7 · bloquea inserts que superan cuotas del plan';
