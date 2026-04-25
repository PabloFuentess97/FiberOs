# ADR-009: Outbox pattern para efectos externos confiables

- Status: accepted
- Date: 2026-04-24
- Sprint: 7

## Contexto

Varias Server Actions disparan efectos externos tras un cambio de estado:
enviar email de invitación, notificar de dominio verificado, webhook a
Stripe, etc. Si el efecto ocurre **dentro** de la Server Action:

1. Un fallo del servicio externo (Resend 5xx) aborta la transacción, lo que
   obliga al usuario a reintentar todo.
2. Si la transacción commitea y **luego** falla el efecto, perdemos la
   notificación silenciosamente (no hay registro de intento fallido).
3. La latencia del usuario es la suma de BD + servicio externo.

Necesitamos garantía "at-least-once" para emails y webhooks.

## Decisión

**Outbox pattern transaccional**. Tabla `outbox_events` + worker
`outbox-dispatcher`.

### Invariante clave

Un cambio de estado (p.ej. "dominio verificado") y la **publicación** de su
evento correspondiente viajan en la **misma transacción**. El dispatcher es
asíncrono: lee `WHERE dispatched_at IS NULL`, llama al handler adecuado,
marca `dispatched_at` al terminar.

### Flujo

```
Server Action:
  BEGIN;
    UPDATE tenant_domains SET status='verifying' WHERE id=...;
    INSERT INTO outbox_events (type='email.domain_verifying', payload) VALUES (...);
  COMMIT;

BullMQ add job → fast path

outbox-dispatcher worker:
  loop:
    fetch pending → handler → send email
    UPDATE outbox_events SET dispatched_at=now() WHERE id=...
```

### Scan de recuperación

Si BullMQ está caído cuando publicamos (p.ej. `publishOutbox` falla en el
`queue.add`), el evento igualmente está en BD. Un `setInterval(scan, 30s)`
en el worker encola eventos `dispatched_at IS NULL` detectados en BD. **No
se pierde nada.**

### Reintentos y dead letter

- BullMQ retry: 10 intentos con backoff exponencial (5s → ~85 min).
- Cada fallo actualiza `attempts` + `last_error` en `outbox_events`.
- Tras 10 intentos, el job pasa a `failed` en BullMQ y queda visible en la
  tabla con `dispatched_at IS NULL` y `attempts>=10`. Super-admin lo revisa.
- No borramos eventos: auditoría permanente de qué se intentó y con qué
  resultado.

### Tipos soportados (Sprint 7)

- `email.invitation` — invitación a organización.
- `email.domain_verifying` / `email.domain_active` / `email.domain_failed`.
- `email.impersonation_notice`.
- `email.bounce` — reprocesar bounces de Resend.
- `webhook.stripe_event` — futuro: reenviar eventos a webhooks del tenant.

## Consecuencias

- **Pros:**
  - **Garantía at-least-once** sin 2PC ni distributed transactions.
  - El usuario ve la confirmación inmediatamente; los emails llegan en
    segundos pero no bloquean la UI.
  - Auditoría completa en BD: cada evento queda con su timestamp, payload y
    error final (o éxito).
  - Reintentos transparentes: Resend 5xx momentáneo no requiere acción humana.

- **Cons / trade-offs:**
  - **Latencia de efecto**: un email tarda de 0.5s a varios segundos más
    que enviarlo inline. Para invitaciones y notificaciones no es crítico.
  - **Duplicación ocasional**: si el handler termina de enviar pero crashea
    antes de marcar `dispatched_at`, el siguiente poll re-enviará. Aceptamos
    "at-least-once": idempotencia client-side (ID de email en Resend, etc).
  - **Ordenación**: el dispatcher no garantiza orden FIFO estricto entre
    eventos de distintas organizaciones. Para secuencias estrictas (raro),
    incluir número de secuencia en payload.
  - **Crecimiento de tabla**: `outbox_events` crece indefinidamente.
    Limpieza manual de `dispatched_at < now() - 90 days` via cron (§19.4)
    cuando el volumen lo justifique.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Enviar email dentro de la Server Action | Bloquea al usuario, pierde eventos ante fallos post-commit. |
| 2PC / distributed tx | Complejidad desproporcionada; Postgres no habla el protocolo X/Open con Resend. |
| Event sourcing completo | Overkill para un MVP con ~5 tipos de eventos. |
| Redis como único outbox | Volátil: si Redis cae antes del dispatch, se pierde el evento. BD como source of truth es más seguro. |
| Kafka / Pulsar | Otro servicio + curva de aprendizaje; no justificado a esta escala. |
| Webhook.site / Upstash QStash | SaaS adicional; resolvemos con lo que ya tenemos (Postgres + Redis + BullMQ). |
