#!/usr/bin/env bash
# Bootstrap de servidor Hetzner Ubuntu 24.04 para FibraOS (§31.3).
# Idempotente: puede re-ejecutarse sin efectos secundarios.
# Ejecutar como root: `ssh root@<ip> bash -s < infra/setup-server.sh`

set -euo pipefail

echo "==> 1. Paquetes base"
apt-get update
apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban unattended-upgrades \
  postgresql-client-16 age rclone \
  htop tmux vim-tiny

echo "==> 2. Docker Engine + Compose plugin"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "==> 3. Usuario deploy (no-root)"
if ! id deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

echo "==> 4. SSH hardening"
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

echo "==> 5. Firewall (ufw)"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> 6. fail2ban"
systemctl enable --now fail2ban

echo "==> 7. Unattended-upgrades (security only)"
dpkg-reconfigure -plow unattended-upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

echo "==> 8. Directorios de la app"
install -d -o deploy -g deploy /opt/fibraos
install -d -o deploy -g deploy \
  /var/lib/fibraos/pgdata \
  /var/lib/fibraos/redisdata \
  /var/lib/fibraos/caddydata \
  /var/lib/fibraos/caddyconfig

echo "==> 9. Timezone (para cron de backup)"
timedatectl set-timezone Europe/Madrid

echo "==> 10. Sysctl tuning básico para Postgres"
cat > /etc/sysctl.d/99-fibraos.conf <<EOF
vm.overcommit_memory=1
net.core.somaxconn=1024
net.ipv4.tcp_max_syn_backlog=2048
EOF
sysctl -p /etc/sysctl.d/99-fibraos.conf

echo ""
echo "✓ Servidor listo. Siguiente:"
echo "  1. Añadir clave pública de CI a /home/deploy/.ssh/authorized_keys"
echo "  2. Clonar el repo en /opt/fibraos como deploy"
echo "  3. Crear /opt/fibraos/.env.production (chmod 600)"
echo "  4. cd /opt/fibraos && docker compose -f docker-compose.prod.yml up -d"
