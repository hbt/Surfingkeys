# inv-docker-vnc — Browser DevTools in VNC Container

## phase 1 — tigervnc local validation ✓

- [x] create `~/workspace/inv/` directory
  ```bash
  mkdir -p ~/workspace/inv
  ```

- [x] copy `~/workspace/tigervnc-ubuntu/` → `~/workspace/inv/tigervnc-ubuntu/`
  ```bash
  cp -r ~/workspace/tigervnc-ubuntu ~/workspace/inv/tigervnc-ubuntu
  ```

- [x] `docker compose up --build` — confirm build passes
  ```bash
  cd ~/workspace/inv/tigervnc-ubuntu && docker compose up -d
  docker compose ps
  ```

- [x] verify VNC port open
  ```bash
  nc -z localhost 5901 && echo "VNC port 5901: open"
  ```

- [x] connect via VNC viewer to `localhost:5901`
  ```bash
  ~/workspace/inv/tigervnc-ubuntu/scripts/connect.sh
  # auto-types password: admin / admin
  ```

- [x] log in to xdm (get auth file, dismiss Chrome dialog if present, click login field)
  ```bash
  AUTH=$(docker exec tigervncubuntu ls /var/lib/xdm/authdir/authfiles/)
  docker exec tigervncubuntu bash -c "
    export DISPLAY=:0
    export XAUTHORITY=/var/lib/xdm/authdir/authfiles/$AUTH
    xdotool mousemove 833 425 click 1   # dismiss Chrome default browser dialog
    sleep 0.5
    xdotool mousemove 600 305 click 1   # click login field
    sleep 0.3
    xdotool type --clearmodifiers 'admin'
    xdotool key Return
    sleep 3
    xdotool type --clearmodifiers 'admin'
    xdotool key Return
  "
  ```

- [x] launch Chrome with DevTools auto-open + navigate to site
  ```bash
  docker exec -d tigervncubuntu bash -c \
    "DISPLAY=:0 su - admin -c 'google-chrome --no-sandbox --auto-open-devtools-for-tabs https://example.com'"
  ```

- [x] dismiss Chrome welcome dialogs (Welcome → OK, Sign in → Don't sign in)
  ```bash
  AUTH=$(docker exec tigervncubuntu ls /var/lib/xdm/authdir/authfiles/)
  # move Chrome into view
  docker exec tigervncubuntu bash -c "
    export DISPLAY=:0
    export XAUTHORITY=/var/lib/xdm/authdir/authfiles/$AUTH
    WIN=\$(xdotool search --name 'Google Chrome' | head -1)
    xdotool windowmove \$WIN 0 30
    xdotool windowsize \$WIN 1280 720
    xdotool windowactivate --sync \$WIN
  "
  # click OK on welcome dialog (~1225,698), then Don't sign in (~916,664)
  docker exec tigervncubuntu bash -c "
    export DISPLAY=:0
    export XAUTHORITY=/var/lib/xdm/authdir/authfiles/$AUTH
    xdotool mousemove 1225 698 click 1
    sleep 5
    xdotool mousemove 916 664 click 1
  "
  ```

- [x] take screenshot to verify
  ```bash
  AUTH=$(docker exec tigervncubuntu ls /var/lib/xdm/authdir/authfiles/)
  docker exec tigervncubuntu bash -c "
    DISPLAY=:0 XAUTHORITY=/var/lib/xdm/authdir/authfiles/$AUTH \
    xwd -root -silent > /tmp/screenshot.xwd
  "
  docker cp tigervncubuntu:/tmp/screenshot.xwd /tmp/screenshot.xwd
  convert /tmp/screenshot.xwd /tmp/screenshot.png
  ```

### warnings (non-fatal, fixed in phase 2)
- `--no-sandbox` flag warning — expected in Docker
- Ubuntu 18.04 unsupported by Chrome — upgrade to 22.04 in phase 2
- F12 / Ctrl+Shift+I don't work without a full WM session — use `--auto-open-devtools-for-tabs` instead

---

## phase 2 — adapt to surfingkeys repo

- [ ] create `docker/devtools/` in surfingkeys repo
- [ ] port Dockerfile — upgrade Ubuntu 18.04 → 22.04
- [ ] add Chrome flags: `--remote-debugging-port=9222 --no-sandbox --load-extension=/ext --auto-open-devtools-for-tabs`
- [ ] add docker-compose.yml — mount `dist/chrome` as `/ext`, expose ports 5901 + 9222
- [ ] autostart Chrome on MATE session start (skip xdm login dialog entirely)
- [ ] suppress Chrome welcome/sign-in dialogs via profile flags
- [ ] wire `:9600` relay — run inside container, expose to host
- [ ] verify `curl localhost:9600/eval-status` → `panelConnected: true`
- [ ] verify `browser-eval --target bg 'chrome.runtime.id'` works from host

## notes

- base: `/home/hassen/workspace/tigervnc-ubuntu/` — TigerVNC + Ubuntu MATE + Chrome + xdotool
- `docker-ubuntu-vnc` (other repo) uses TightVNC + LXDE — skip
- `host.docker.internal` may need `extra_hosts` entry on Linux
