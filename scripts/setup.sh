#!/usr/bin/env bash
# Q one-time setup. This is the ONLY step that uses the internet.
# After it finishes, Q runs fully on this Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

MODEL="${Q_MODEL:-llama3.2:3b}"
WHISPER_MODEL="models/ggml-base.en.bin"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
todo() { printf "  \033[33m→\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✕\033[0m %s\n" "$1"; }

echo
echo "Q setup — downloads speech + language models (about 2.2 GB total)."
echo

# 1. Node
if command -v node >/dev/null 2>&1; then
  ok "Node $(node -v)"
else
  fail "Node.js not found. Install Node 20+ from https://nodejs.org, then rerun."
  exit 1
fi

# 2. Homebrew (needed for whisper.cpp)
if command -v brew >/dev/null 2>&1; then
  ok "Homebrew"
else
  fail "Homebrew not found. Install it from https://brew.sh, then rerun."
  exit 1
fi

# 3. whisper.cpp (speech-to-text)
if command -v whisper-server >/dev/null 2>&1 || command -v whisper-cli >/dev/null 2>&1; then
  ok "whisper.cpp"
else
  todo "Installing whisper.cpp (brew install whisper-cpp)…"
  brew install whisper-cpp
  ok "whisper.cpp installed"
fi

# 4. Whisper model (~148 MB)
mkdir -p models
if [ -s "$WHISPER_MODEL" ]; then
  ok "Whisper model ($WHISPER_MODEL)"
else
  todo "Downloading Whisper base.en model (~148 MB)…"
  curl -L --fail --progress-bar -o "$WHISPER_MODEL.part" "$WHISPER_URL"
  mv "$WHISPER_MODEL.part" "$WHISPER_MODEL"
  ok "Whisper model downloaded"
fi
echo "     sha256: $(shasum -a 256 "$WHISPER_MODEL" | cut -d' ' -f1)"

# 5. Ollama (language model runtime)
if ! command -v ollama >/dev/null 2>&1; then
  fail "Ollama not found. Install the app from https://ollama.com/download, open it once, then rerun this script."
  exit 1
fi
ok "Ollama $(ollama --version 2>/dev/null | awk '{print $NF}')"
if ! curl -s -m 2 http://127.0.0.1:11434/api/version >/dev/null; then
  fail "Ollama is installed but not running. Open the Ollama app, then rerun."
  exit 1
fi

# 6. Language model (~2 GB)
if ollama list | awk '{print $1}' | grep -qx "$MODEL"; then
  ok "Model $MODEL"
else
  todo "Pulling $MODEL (~2 GB)…"
  ollama pull "$MODEL"
  ok "Model $MODEL ready"
fi

# 7. Voice
if command -v say >/dev/null 2>&1; then
  ok "macOS voice (say)"
fi

# 8. Speech helper (keeps the voice loaded; compiled from speech/q-speak.swift)
if command -v swiftc >/dev/null 2>&1; then
  todo "Building the speech helper…"
  if npm run --silent build:speech; then
    ok "Speech helper (bin/q-speak)"
  else
    fail "Speech helper didn't build. Q will use say instead, which is slower."
  fi
else
  todo "swiftc not found (it comes with Xcode or its command line tools). Q will use say instead, which is slower."
fi

# 9. Q's own window (menu bar item and the ⌥Space talk key; compiled from shell/q-shell.swift)
if command -v swiftc >/dev/null 2>&1; then
  todo "Building Q's window…"
  if npm run --silent build:shell; then
    ok "Q's window (bin/Q.app)"
  else
    fail "Q's window didn't build. Q will open in your browser instead."
  fi
else
  todo "Without swiftc there is no Q window either. Q will open in your browser instead."
fi

echo
echo "All set. Start Q by double-clicking \"Start Q.command\" in this folder."
echo "Or run npm start and open http://127.0.0.1:4141 in Safari or Chrome."
echo
