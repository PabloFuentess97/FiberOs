# ADR-007: Worker deployment (Hetzner + Docker Compose, no Fly.io)

- Status: accepted
- Date: 2026-04-24
- Sprint: 6

## Contexto

BullMQ necesita un proceso Node separado del web server para ejecutar jobs
(`import-runner`, `outbox-dispatcher`, `tenant-domain-verifier`). El
blueprint original del prompt fuente mencionaba Fly.io como opción de
deployment. Tras ADR-001 cerramos Hetzner + Docker Compose; ADR-007 queda
reescrito para reflejar la ruta real.

## Decisión

**El worker es un contenedor Docker `worker` en el mismo `docker-compose.prod.yml`**
(§31.4 del blueprint) compartiendo imagen con `app` pero arrancando con
`WORKER_MODE=true` y `command: node dist/worker.js`.

- Entrypoint: `lib/queues/worker-entrypoint.ts` (en dev via `pnpm worker`,
  en prod bundle Next produce `dist/worker.js`).
- Un único proceso Node contiene todos los workers BullMQ. Cada worker se
  arranca con `startXxxWorker()` y comparte la conexión Redis.
- Concurrencia por worker: `import-runner` 2 (imports grandes son I/O y BD
  intensivo; más procesos pelean por IOPS); otros workers TBD.
- El contenedor `app` **también** arranca en modo web cuando `WORKER_MODE`
  no está definido, así la imagen es única y los deploys atómicos.

### Escalado

- MVP: 1 contenedor worker (replicas: 1).
- Crecimiento: aumentar `replicas` en compose — BullMQ gestiona distribución
  FIFO sin coordinación adicional.
- Separar a servidor dedicado (§31.11): si los imports grandes saturan CPU,
  se despliega un Hetzner CPX21 aparte con solo `worker` + conexión a
  Redis/Postgres por red privada Hetzner.

### Jobs

- `imports` (Sprint 6): runner de importación Excel/CSV.
- `outbox` (Sprint 7): dispatcher de emails y webhooks salientes.
- `domain-verifier` (Sprint 7): poll DNS para dominios custom.
- Opciones de jobs comunes: `attempts: 3`, backoff exponencial, limpieza
  después de 7 días (complete) / 30 días (failed).

## Consecuencias

- **Pros:**
  - Coste cero adicional — se añade un contenedor al único nodo Hetzner.
  - Mismo ciclo de deploy (push imagen → `docker compose up -d worker`).
  - Rollback trivial: tag `:previous` revierte ambos.
  - Sin vendor lock-in. Si en el futuro migramos a Fly.io o Railway, cambiamos
    solo el `docker-compose.prod.yml` por el equivalente.

- **Cons / trade-offs:**
  - Sin auto-scaling "por carga de cola" como ofrece Fly.io. Aceptable: para
    FibraOS MVP los picos son predecibles (imports manuales anuales).
  - Worker comparte recursos del nodo con Postgres + web. Un import de 50k
    filas puede robar CPU del web. Mitigación: límite `cpus: 1.0` en
    docker-compose (añadir en Sprint 8).
  - Observabilidad: logs del worker van al mismo driver json-file que el
    resto; separar por `service: worker` en Grafana.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Fly.io dedicated worker | Añade proveedor adicional, billing aparte, contradice ADR-001 (single host). |
| Lambda / Cloud Run | Cold starts incompatibles con BullMQ pull; BullMQ asume worker long-running. |
| Cron + script invocado | No sirve para jobs on-demand encolados por UI. |
| Mismo proceso Next.js con `next-pg-boss` o similar | Acopla web y jobs: OOM en worker tumba el web. Separación de procesos es robusta. |
| Temporal.io | Overkill absoluto para 3 jobs simples. |
