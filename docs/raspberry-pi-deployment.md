# Raspberry Pi 3 deployment guide

Run the RC Control Station web app locally on a Raspberry Pi 3 so you can control the car from any device on the same network without relying on the cloud preview.

## What you need

- Raspberry Pi 3 (or newer) with Raspberry Pi OS Lite/Desktop
- SSH access to the Pi (`pi@raspberrypi.local` or its IP address)
- Either a faster dev machine to build the app before copying it, **or** patience to build it directly on the Pi

## How it works

The app is a static React site. The Pi only serves the web files; the browser then connects directly to the ESP32-CAM/WebSocket server in the car.

You have two deployment options:

1. **Cross-build (recommended)** — Build on your dev machine and copy the static files to the Pi. Fast and gentle on the Pi.
2. **Native build** — Download the source to the Pi with `git` and build it there. Useful if you want to edit code directly on the Pi or do not have another computer.

If you already pushed the project to GitHub and want the Pi to fetch and build it automatically, see the **One-command clone + setup** shortcut in Option B.

---

## Option A: Cross-build (recommended)

### One-time Pi setup

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

### Deploy from your development machine

Edit `scripts/deploy-to-pi.sh` and set:

```bash
PI_HOST=pi@raspberrypi.local
PI_WEB_ROOT=/var/www/rc-control
```

Use the Pi's IP address if `.local` does not resolve on your network.

Build and deploy:

```bash
bun run build
bun run deploy:pi
```

This copies `dist/client/` to the Pi and reloads nginx.

Open the app on any device on the same network:

```
http://raspberrypi.local
```

### Updating after code changes

Run the same two commands again:

```bash
bun run build
bun run deploy:pi
```

---

## Option B: Build natively on the Raspberry Pi

> ⚠️ **Warning:** A Pi 3 only has 1 GB RAM. The Vite/TanStack build is heavy and can take 10–30 minutes, or longer if swap is too small. A Pi 4/5 with more RAM is much more comfortable. The scripts below configure extra swap to make the build possible.

### 1. Download the project from GitHub

SSH into the Pi and clone your repository. Replace the URL below with your own repo URL:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git rc-control-app
cd rc-control-app
```

> **Tip:** If your repository is private, use SSH instead (`git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git`) or create a [GitHub personal access token](https://github.com/settings/tokens) and clone with `https://<token>@github.com/YOUR_USERNAME/YOUR_REPO_NAME.git`.

To update the app later after pushing changes from another machine:

```bash
cd ~/rc-control-app
git pull
bash scripts/pi-build.sh
```

### One-command clone + setup shortcut

If you want the Pi to download, build, and serve the app in one go, SSH in and run:

```bash
export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/scripts/pi-clone-and-setup.sh | bash
```

Or, after cloning once, run the included script directly:

```bash
export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
bash scripts/pi-clone-and-setup.sh
```

This clones/updates the repo, installs dependencies, builds the app, configures nginx, and enables auto-start on boot.

### 2. Prepare the Pi

Run the setup script inside the project directory:

```bash
cd rc-control-app
bash scripts/pi-build-setup.sh
```

This installs Node.js, bun, nginx, git, and configures a 2 GB swap file.

### 2. Build the app on the Pi

Inside the project directory on the Pi:

```bash
bash scripts/pi-build.sh
```

The script limits Node's memory usage and skips optional dependencies to reduce the chance of an out-of-memory error.

### 3. Serve the app

#### With nginx (recommended for port 80)

```bash
sudo cp deployment/nginx-rc-control.conf /etc/nginx/sites-available/rc-control.conf
sudo ln -sf /etc/nginx/sites-available/rc-control.conf /etc/nginx/sites-enabled/rc-control.conf
sudo nginx -t && sudo systemctl reload nginx
```

#### With the built-in Node fallback server

```bash
bash scripts/pi-serve.sh
```

Or run it directly:

```bash
PORT=3000 ROOT=dist/client node deployment/pi-server.js
```

### 4. Start on boot (optional)

Copy the included systemd service and enable it:

```bash
sudo cp deployment/rc-control.service /etc/systemd/system/rc-control.service
sudo systemctl daemon-reload
sudo systemctl enable rc-control
sudo systemctl start rc-control
```

The app will now start automatically when the Pi boots.

---

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

---

## Troubleshooting

- **Cannot reach the page**: make sure the Pi firewall allows port 80/3000 and the device is on the same network.
- **Page loads but car does not connect**: the browser must be able to reach the ESP32/WebSocket address configured in Settings. The Pi only serves the web files; it does not proxy the car connection by default.
- **Build fails with OOM / JavaScript heap out of memory**: The Pi 3 needs more swap. Run `scripts/pi-build-setup.sh` again to ensure the 2 GB swap file is active, or increase it further with `sudo dphys-swapfile swapoff && sudo nano /etc/dphys-swapfile`.
- **Build takes forever**: This is expected on a Pi 3. Use the cross-build workflow (Option A) for faster iteration.

