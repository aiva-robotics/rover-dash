#!/usr/bin/env bash
# Deploy the built RC Control Station app to a Raspberry Pi running nginx.
# Run: bun run build && bun run deploy:pi

set -euo pipefail

PI_HOST="${PI_HOST:-pi@raspberrypi.local}"
PI_WEB_ROOT="${PI_WEB_ROOT:-/var/www/rc-control}"
LOCAL_BUILD="${LOCAL_BUILD:-dist/client}"
NGINX_SITE="rc-control"

echo "Deploying to $PI_HOST ..."

if [ ! -d "$LOCAL_BUILD" ]; then
  echo "Error: build output not found at $LOCAL_BUILD"
  echo "Run 'bun run build' first."
  exit 1
fi

# Copy static files to the Pi
rsync -av --delete "$LOCAL_BUILD/" "$PI_HOST:$PI_WEB_ROOT/"

# Copy the fallback Node server too, just in case
scp "deployment/pi-server.js" "$PI_HOST:$PI_WEB_ROOT/" || true

# Install nginx config and reload if nginx is present
if ssh "$PI_HOST" "command -v nginx >/dev/null 2>&1"; then
  scp "deployment/nginx-rc-control.conf" "$PI_HOST:/tmp/$NGINX_SITE.conf"
  ssh "$PI_HOST" "
    sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    sudo mv /tmp/$NGINX_SITE.conf /etc/nginx/sites-available/$NGINX_SITE.conf
    sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE.conf /etc/nginx/sites-enabled/$NGINX_SITE.conf
    sudo nginx -t && sudo systemctl reload nginx
  "
  echo "Deployed to http://$PI_HOST (nginx)"
else
  echo "nginx not found on Pi. Start the fallback server with:"
  echo "  ssh $PI_HOST 'node $PI_WEB_ROOT/pi-server.js'"
fi

echo "Done."
