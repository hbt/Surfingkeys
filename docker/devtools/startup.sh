#!/bin/bash
set -e

# Fix volume ownership so admin user can write to Chrome profile dir
chown -R admin:admin /chrome-data

# Start Xtigervnc (no password, display :0)
su - admin -c "
  Xtigervnc :0 \
    -geometry 1280x768 \
    -depth 24 \
    -SecurityTypes None \
    -nolisten tcp \
    -desktop sfk-devtools \
    &
"
sleep 2

# Start dbus daemon and MATE session
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true
su - admin -c "DISPLAY=:0 dbus-launch mate-session &"
sleep 3

# Start eval relay server
bun /surfingkeys/scripts/server.ts &
sleep 1

# Start Chrome with extension + DevTools auto-open
su - admin -c "
  DISPLAY=:0 google-chrome \
    --no-sandbox \
    --disable-gpu \
    --auto-open-devtools-for-tabs \
    --remote-debugging-port=9222 \
    --load-extension=/ext \
    --user-data-dir=/chrome-data \
    --no-first-run \
    --no-default-browser-check \
    https://example.com \
    &
"

# Keep container alive
wait
