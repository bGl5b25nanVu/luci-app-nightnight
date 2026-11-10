#!/usr/bin/env bash
set -euo pipefail

ROUTER="${1:-root@192.168.8.1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] Syncing NightNight files to $ROUTER ..."
COPYFILE_DISABLE=1 tar -C "$SCRIPT_DIR/root" -czf - usr etc www | ssh "$ROUTER" 'tar -C / -xzf - && chown -R root:root /usr/sbin/nightnightd /etc/init.d/nightnight /usr/share/luci/menu.d/luci-app-nightnight.json /usr/share/rpcd/acl.d/luci-app-nightnight.json /www/cgi-bin/nightnight-api /www/nightnight /www/luci-static/resources/view/nightnight'

echo "[2/4] Setting permissions on $ROUTER ..."
ssh "$ROUTER" '
chmod +x /usr/sbin/nightnightd /etc/init.d/nightnight /www/cgi-bin/nightnight-api
chmod +x /Users/liyongjun/.gemini/antigravity/scratch/luci-app-nightnight/mcp-server/nightnight-mcp.mjs 2>/dev/null || true
'

echo "[3/4] Enabling and starting netifyd & nightnight services ..."
ssh "$ROUTER" '
/etc/init.d/netifyd enable
/etc/init.d/netifyd start || /etc/init.d/netifyd restart
/etc/init.d/nightnight enable
/etc/init.d/nightnight restart
/etc/init.d/rpcd reload
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache*
'

echo "[4/4] Verifying NightNight status ..."
sleep 3
ssh "$ROUTER" '
ps w | grep -E "netifyd|nightnightd" | grep -v grep
ls -la /tmp/nightnight/
'
echo "Deployment complete! Open http://192.168.8.1/nightnight/ or http://192.168.8.1/cgi-bin/luci/admin/services/nightnight"
