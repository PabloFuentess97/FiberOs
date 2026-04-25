# Caddy 2.8 con plugin caddy-dns/cloudflare para DNS-01 wildcard.
FROM caddy:2.8-builder-alpine AS builder
RUN xcaddy build \
  --with github.com/caddy-dns/cloudflare

FROM caddy:2.8-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Health de la imagen (xcaddy debe exponer `caddy` funcional)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:2019/reverse_proxy/upstreams || exit 1
