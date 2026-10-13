#!/bin/bash
# Builds the D-010 shell spike into spike/build/QShell.app (not committed).
# Start it with:  open -n spike/build/QShell.app --args --probe --log /tmp/qshell.log
set -euo pipefail
cd "$(dirname "$0")"
APP=build/QShell.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp Info.plist "$APP/Contents/Info.plist"
swiftc -O -swift-version 5 q-shell.swift -o "$APP/Contents/MacOS/QShell"
codesign --force --sign - "$APP" # ad-hoc, local only: macOS needs a signature to remember the mic permission
echo "built $APP ($(du -sh "$APP" | cut -f1))"
