#!/usr/bin/env bash
# Pull the latest Lullwatch from GitHub, rebuild the app and restart. Run on the server:
#   bash /opt/lullwatch/deploy/update.sh
set -euo pipefail
cd /opt/lullwatch
git pull --ff-only
(cd app && npm ci && npm run build)
sudo systemctl restart lullwatch
sudo systemctl --no-pager status lullwatch | head -n 5
