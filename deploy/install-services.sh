#!/usr/bin/env bash
# One-time administrator setup; CI cannot modify system units or Nginx.
set -euo pipefail
test "$(id -u)" = 0
id momentnest-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash momentnest-deploy
install -d -o momentnest-deploy -g momentnest-deploy -m 750 /opt/apps/momentnest /opt/apps/momentnest/releases
install -d -o momentnest-deploy -g momentnest-deploy -m 700 /var/lib/momentnest /var/lib/momentnest/media /var/lib/momentnest/backups
install -d -o root -g momentnest-deploy -m 750 /etc/momentnest
for name in web storage worker; do
  case "$name" in
    web) command='/usr/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3210'; memory=1G; stop=30 ;;
    storage) command='/usr/bin/node --import tsx workers/storage.ts'; memory=512M; stop=920 ;;
    worker) command='/usr/bin/node --import tsx workers/media.ts'; memory=1536M; stop=1250 ;;
  esac
  cat > "/etc/systemd/system/momentnest-$name.service" <<UNIT
[Unit]
Description=MomentNest $name
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=momentnest-deploy
Group=momentnest-deploy
WorkingDirectory=/opt/apps/momentnest/current
EnvironmentFile=/etc/momentnest/runtime.env
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=$command
Restart=on-failure
RestartSec=5
TimeoutStopSec=$stop
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/momentnest /opt/apps/momentnest
MemoryMax=$memory
CPUQuota=150%
[Install]
WantedBy=multi-user.target
UNIT
done
cat > /etc/sudoers.d/momentnest-deploy <<'SUDO'
momentnest-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart momentnest-web.service momentnest-storage.service momentnest-worker.service, /usr/bin/systemctl stop momentnest-web.service momentnest-storage.service momentnest-worker.service
SUDO
chmod 440 /etc/sudoers.d/momentnest-deploy
visudo -cf /etc/sudoers.d/momentnest-deploy
systemctl daemon-reload
systemctl enable momentnest-web.service momentnest-storage.service momentnest-worker.service
echo 'Service setup complete; runtime.env and release activation are still required.'
