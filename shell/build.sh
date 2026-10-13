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
# Ad-hoc signature, local only: macOS needs one to remember the microphone permission.
codesign --force --sign - "$APP" 2>/dev/null
