# Raspberry Pi 3 deployment guide

Run the RC Control Station web app locally on a Raspberry Pi 3 so you can control the car from any device on the same network without relying on the cloud preview.

## What you need

- Raspberry Pi 3 (or newer) with Raspberry Pi OS Lite/Desktop
- SSH access to the Pi (`pi@raspberrypi.local` or its IP address)
- Either a faster dev machine to build the app before copying it, **or** patience to build it directly on the Pi

## How it works

The app is server-rendered, so the Pi runs a small Node server (built with the `node-server` target) behind nginx on port 80. The browser still connects directly to the ESP32-CAM/WebSocket server in the car.

You have two deployment options:

1. **Cross-build (recommended)** — Build on your dev machine and copy the server bundle to the Pi. Fast and gentle on the Pi.
2. **Native build** — Download the source to the Pi with `git` and build it there. Useful if you want to edit code directly on the Pi or do not have another computer.

If you already pushed the project to GitHub and want the Pi to fetch and build it automatically, see the **One-command clone + setup** shortcut in Option B.


---

## Option A: Cross-build (recommended)

### One-time Pi setup

SSH into the Pi and run:

```bash
sudo apt update
sudo apt install -y nginx nodejs
sudo systemctl enable nginx
```

### Deploy from your development machine

Set the target host (or edit `scripts/deploy-to-pi.sh`):

```bash
export PI_HOST=pi@raspberrypi.local
export PI_APP_DIR=/home/pi/rc-control-app
```

Use the Pi's IP address if `.local` does not resolve on your network.

Build and deploy:

```bash
NITRO_PRESET=node-server bun run build
bun run deploy:pi
```

This copies the `.output/` server bundle to the Pi, installs the `rc-control` systemd service and the nginx reverse proxy, and starts the app.

Open the app on any device on the same network:

```
http://raspberrypi.local
```

### Updating after code changes

Run the same two commands again:

```bash
NITRO_PRESET=node-server bun run build
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

#### Private repositories

If your GitHub repository is private, use **one** of these methods on the Pi:

**A. SSH key (recommended if you use the Pi often)**

1. Generate or copy an SSH key to the Pi:
   ```bash
   ssh-keygen -t ed25519 -C "pi@raspberrypi"
   cat ~/.ssh/id_ed25519.pub
   ```
2. Add the key in GitHub under **Settings → SSH and GPG keys → New SSH key**.
3. Clone with the SSH URL:
   ```bash
   git clone git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git rc-control-app
   ```

**B. Personal access token (good for one-command setup)**

1. Create a token in GitHub under **Settings → Developer settings → Personal access tokens → Tokens (classic)**. Give it at least the `repo` scope.
2. On the Pi, export the token and run the helper script:
   ```bash
   export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   bash scripts/pi-clone-and-setup.sh
   ```
   The script uses the token only during clone/pull and does **not** save it in `.git/config`.

**C. Manual token clone**

```bash
cd ~
git clone https://ghp_xxxxxxxxxxxxxxxxxxxx@github.com/YOUR_USERNAME/YOUR_REPO_NAME.git rc-control-app
cd rc-control-app
# Remove the token from the stored origin URL so it is not saved on disk
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

> **Note:** The one-command `curl ... | bash` shortcut below only works for **public** repositories, because `raw.githubusercontent.com` cannot fetch files from a private repo without authentication.

To update the app later after pushing changes from another machine:

```bash
cd ~/rc-control-app
# For a public repo or an SSH-cloned private repo:
git pull
# For a private HTTPS repo with a token:
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
bash scripts/pi-clone-and-setup.sh
bash scripts/pi-build.sh
```

### One-command clone + setup shortcut (public repos only)

If your repo is public and you want the Pi to download, build, and serve the app in one go, SSH in and run:

```bash
export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO_NAME/main/scripts/pi-clone-and-setup.sh | bash
```

Or, after cloning once, run the included script directly (this works with `GITHUB_TOKEN` for private repos too):

```bash
export REPO_URL=https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # only needed for private repos
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

### 3. Build the app on the Pi

Inside the project directory on the Pi:

```bash
bash scripts/pi-build.sh
```

The script limits Node's memory usage, installs optional dependencies (needed for Rolldown), and builds a self-hosted Node server bundle (`NITRO_PRESET=node-server` → `.output/server/index.mjs`).

When the build finishes it **deploys automatically**:

- installs the `rc-control` systemd service that runs `.output/server/index.mjs` on port 3000 (auto-start on boot)
- installs the nginx reverse proxy config on port 80 and reloads nginx
- starts the service and verifies it is running

Skip the deploy step with:

```bash
DEPLOY=false bash scripts/pi-build.sh
```

Deploy an existing build separately with:

```bash
bash scripts/pi-deploy-local.sh   # or: npm run pi:deploy
```

### 4. Managing the app

```bash
sudo systemctl status rc-control      # is it running?
sudo journalctl -u rc-control -f      # live logs
sudo systemctl restart rc-control     # restart after a rebuild
```

Run the server in the foreground (without systemd) with:

```bash
bash scripts/pi-serve.sh              # PORT=3000 by default
```

---

## No nginx?

The app also works without nginx — it just runs on port 3000 instead of 80:

```
http://raspberrypi.local:3000
```


---

## Troubleshooting

- **`Cannot find module './rolldown-binding.linux-arm64-gnu.node'`**: The build tool (Vite 8 / Rolldown) needs a native binary that is installed as an *optional* dependency. Do a clean install with optional deps enabled:
  ```bash
  cd ~/rc-control-app
  rm -rf node_modules package-lock.json
  npm install --include=optional
  bash scripts/pi-build.sh
  ```
  Make sure you are **not** setting `npm_config_optional=false` and that you run the 64-bit Raspberry Pi OS — check with `uname -m` (must print `aarch64`). On a 32-bit OS (`armv7l`) there is no prebuilt binary; either reflash with the 64-bit image or use the cross-build workflow (Option A).
- **Cannot reach the page**: make sure the Pi firewall allows port 80/3000 and the device is on the same network.
- **Page loads but car does not connect**: the browser must be able to reach the ESP32/WebSocket address configured in Settings. The Pi only serves the web files; it does not proxy the car connection by default.
- **Build fails with OOM / JavaScript heap out of memory**: The Pi 3 needs more swap. Run `scripts/pi-build-setup.sh` again to ensure the 2 GB swap file is active, or increase it further with `sudo dphys-swapfile swapoff && sudo nano /etc/dphys-swapfile`.
- **Build takes forever**: This is expected on a Pi 3. Use the cross-build workflow (Option A) for faster iteration.

