#!/bin/bash
# Builds Q's native shell into bin/Q.app (bin/ is not committed).
# Run it with: npm run build:shell
set -euo pipefail
cd "$(dirname "$0")/.."
APP=bin/Q.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp shell/Info.plist "$APP/Contents/Info.plist"
swiftc -O -swift-version 5 shell/q-shell.swift -o "$APP/Contents/MacOS/Q"
# Icons, drawn from the same description of the mark as the page (public/mark.js).
# Without them Q.app still works: a plain "Q" in the menu bar and the default app icon.
RES="$APP/Contents/Resources"
TMP="$(mktemp -d)"
mkdir -p "$RES"
if command -v node >/dev/null 2>&1 && node shell/make-assets.mjs "$TMP"; then
  cp "$TMP/menubar.svg" "$RES/menubar.svg"
  swiftc -O -swift-version 5 shell/make-icon.swift -o "$TMP/make-icon" \
    && "$TMP/make-icon" "$TMP/icon.svg" "$TMP/icon-small.svg" "$TMP/Q.iconset" \
    && iconutil -c icns "$TMP/Q.iconset" -o "$RES/Q.icns" \
    || echo "The app icon didn't build; Q.app keeps the default one."
else
  echo "Node isn't available here, so Q.app is built without its icons."
fi
rm -rf "$TMP"

# Ad-hoc signature, local only: macOS needs one to remember the microphone permission.
codesign --force --sign - "$APP" 2>/dev/null
