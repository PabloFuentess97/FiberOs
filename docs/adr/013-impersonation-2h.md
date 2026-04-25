# ADR-013: Impersonación con time-limit 2h + email al target

- Status: accepted
- Date: 2026-04-24
- Sprint: 7

## Contexto

El equipo de soporte necesita ocasionalmente acceder a la cuenta de un
usuario para reproducir bugs o guiarle en un flujo. El modelo debe:

1. Ser **auditable**: cada acción queda marcada con el super-admin real.
2. Ser **consentido por norma**: el target sabe cuándo se accede a su cuenta.
3. **Expirar**: no queda una sesión abierta eternamente.

## Decisión

- Tabla `impersonations` con `actor_user_id`, `target_user_id`, `reason`,
  `started_at`, `ends_at = now() + 2h`, `ended_at`.
- Cookie `fibraos_impersonation` con payload base64 JSON (MVP) → JWT HMAC
  en Sprint 8+. TTL = `ends_at - now()`.
- `requireTenantContext` (lib/tenancy/guards.ts) lee la cookie: si es
  válida + el actor es super-admin + la org coincide, devuelve el
  `targetUserId` como `userId` pero conserva `impersonatedBy`.
- El trigger de audit (§7.3) graba `acted_as_by = impersonatedBy`. Todas
  las mutaciones quedan con doble atribución.
- **Email al target** via outbox (`email.impersonation_notice`) en el
  momento de iniciar. No se puede impersonar silenciosamente.
- **Banner rojo persistente** en el dashboard mientras dura.
- **Motivo obligatorio** (≥10 chars) registrado en `impersonations.reason`.

## Consecuencias

- **Pros**:
  - Cumple buenas prácticas SaaS de "no silent access".
  - Límite duro de 2h evita ventanas olvidadas abiertas.
  - Auditoría completa: se puede reconstruir quién hizo qué.
  - Target puede objetar por email si no espera el acceso.

- **Cons**:
  - Complica el middleware: un solo punto de fallo si la resolución de
    impersonación tiene bug (podría dar acceso indebido).
  - Cookie base64 del MVP es tamper-resistant solo por el HttpOnly + Secure;
    migrar a JWT firmado en Sprint 8+.

## Alternativas

| Alternativa | Por qué descartada |
|---|---|
| Admin "ve como" sin cookie (solo SQL) | No verifica la UX real; solo query de datos. Insuficiente. |
| Sesión ilimitada | Violaría buenas prácticas y SOC 2. |
| Sin notificación al target | Contradice expectativa del usuario y legislación (RGPD). |
| MFA adicional para iniciar | Buena idea — lo añadimos cuando Better Auth 2FA TOTP esté listo. |
