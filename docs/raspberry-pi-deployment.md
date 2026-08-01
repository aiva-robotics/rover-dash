# Raspberry Pi 3 deployment guide

Run the RC Control Station web app locally on a Raspberry Pi 3 so you can control the car from any device on the same network without relying on the cloud preview.

## What you need

- Raspberry Pi 3 (or newer) with Raspberry Pi OS Lite/Desktop
- Node.js/bun on the machine where you develop the app (the build is done there, not on the Pi)
- SSH access to the Pi (`pi@raspberrypi.local` or its IP address)

## How it works

1. Build the app on your development machine.
2. Copy the static files to the Pi.
3. Serve them with nginx.
4. Open `http://raspberrypi.local` in any browser on the same Wi-Fi network.

The app itself is a static React site. The browser then connects directly to the ESP32-CAM/WebSocket server in the car.

## One-time Pi setup

SSH into the Pi and run:

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
```

Create the web root folder:

```bash
sudo mkdir -p /var/www/rc-control
sudo chown -R $USER:$USER /var/www/rc-control
```

## Deploy from your development machine

### 1. Configure the target

Edit `scripts/deploy-to-pi.sh` and set:

```bash
PI_HOST=pi@raspberrypi.local
PI_WEB_ROOT=/var/www/rc-control
```

Use the Pi's IP address if `.local` does not resolve on your network.

### 2. Build and deploy

```bash
bun run build
bun run deploy:pi
```

This copies `dist/client/` to the Pi and reloads nginx.

### 3. Open the app

On any device on the same network:

```
http://raspberrypi.local
```

If you changed the Pi hostname, use that instead.

## Updating after code changes

Run the same two commands again:

```bash
bun run build
bun run deploy:pi
```

## No nginx? Use the tiny Node fallback

If you prefer not to install nginx, copy the files to the Pi and run the included static server:

```bash
scp -r dist/client/* pi@raspberrypi.local:/var/www/rc-control/
ssh pi@raspberrypi.local "node /var/www/rc-control/pi-server.js"
```

The fallback server listens on port 3000:

```
http://raspberrypi.local:3000
```

## Troubleshooting

- **Cannot reach the page**: make sure the Pi firewall allows port 80/3000 and the device is on the same network.
- **Page loads but car does not connect**: the browser must be able to reach the ESP32/WebSocket address configured in Settings. The Pi only serves the web files; it does not proxy the car connection by default.
- **Build fails on the Pi**: do not build on the Pi 3. It only has 1 GB RAM and the Vite/TanStack build is heavy. Always build on your dev machine and copy the `dist/client/` folder.
