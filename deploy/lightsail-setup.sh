#!/usr/bin/env bash
# One-time setup of Lullwatch on an Ubuntu 24.04 server (AWS Lightsail).
# Run on the server:  bash lightsail-setup.sh lullwatch.54-255-109-186.sslip.io
# Installs Node 22 and Caddy if missing, clones the repo to /opt/lullwatch, builds the app and
# runs it as a service on 127.0.0.1:8787 behind Caddy (HTTPS from Let's Encrypt).
# Other sites already in the Caddyfile are kept. The API key is typed on the server
# afterwards; this script never asks for it.
set -euo pipefail
DOMAIN="${1:?usage: bash lightsail-setup.sh your.domain}"
APP=/opt/lullwatch
PORT=8787

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y curl gpg debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi
command -v git >/dev/null || sudo apt-get install -y git

if [ ! -d "$APP/.git" ]; then
  sudo git clone https://github.com/tomcode1000/lullwatch.git "$APP"
  sudo chown -R "$USER":"$USER" "$APP"
fi

(cd "$APP/app" && npm ci && npm run build)

# The key name only; paste the value in with nano afterwards.
if [ ! -f "$APP/.env" ]; then
  cat > "$APP/.env" <<ENV
NEARAI_API_KEY=
DAILY_CAP_USD=0.25
TOTAL_CAP_USD=8
ENV
fi
chmod 600 "$APP/.env"

sudo tee /etc/systemd/system/lullwatch.service >/dev/null <<UNIT
[Unit]
Description=Lullwatch
After=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP/server
EnvironmentFile=$APP/.env
Environment=PORT=$PORT
ExecStart=/usr/bin/node main.ts
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable lullwatch
sudo systemctl restart lullwatch

# Add this site to the Caddyfile without touching the others. The new file is
# checked first and only then swapped in, so a mistake can't take other sites down.
if ! sudo grep -q "^$DOMAIN {" /etc/caddy/Caddyfile 2>/dev/null; then
  NEW=$(mktemp)
  sudo cat /etc/caddy/Caddyfile > "$NEW" 2>/dev/null || true
  cat >> "$NEW" <<CADDY

$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT
}
CADDY
  sudo caddy validate --config "$NEW" --adapter caddyfile
  sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-lullwatch" 2>/dev/null || true
  sudo cp "$NEW" /etc/caddy/Caddyfile
  rm -f "$NEW"
fi
sudo systemctl enable caddy
# reload, not restart: sites already being served keep running without a gap.
sudo systemctl reload caddy

echo
echo "Done. Next: nano $APP/.env  (paste the key after NEARAI_API_KEY=), then: sudo systemctl restart lullwatch"
echo "Then open https://$DOMAIN/?sample"
