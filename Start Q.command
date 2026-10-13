#!/bin/bash
# Start Q — double-click this file to launch Q.
# If Q's own window is built (bin/Q.app) this only opens it: the app starts
# Ollama and Q's server itself and stops the server when you quit it from the
# menu bar, so this Terminal window can be closed straight away.
# Without the app it makes sure Ollama is running, starts the Q server in this
# window and opens Q in your browser; then Ctrl+C or closing the window stops Q.

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT="${Q_PORT:-4141}"
URL="http://127.0.0.1:$PORT"
OLLAMA_URL="http://127.0.0.1:11434"

# Go to the Q folder: the real location of this file, even through a symlink.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
cd -P "$(dirname "$SOURCE")" || exit 1

say_ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
say_todo() { printf "  \033[33m→\033[0m %s\n" "$1"; }
give_up() {
  printf "\n  \033[31m✕\033[0m %s\n\n" "$1"
  read -n 1 -s -r -p "  Press any key to close."
  echo
  exit 1
}

# Q's own status page, not just anything answering on the port.
q_is_up() { curl -s -m 2 "$URL/api/status" 2>/dev/null | grep -q '"warmup"'; }
ollama_is_up() { curl -s -m 2 "$OLLAMA_URL/api/version" >/dev/null 2>&1; }

echo
echo "  Starting Q"
echo

# 0. Q's own window looks after everything else.
if [ -d bin/Q.app ]; then
  open bin/Q.app --args "$URL"
  say_ok "Q is opening in its own window. You can close this one."
  echo
  exit 0
fi

# 1. Already running? Just open the page.
if q_is_up; then
  say_ok "Q is already running. Opening $URL"
  open "$URL"
  exit 0
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  give_up "Something other than Q is using port $PORT. Quit it, then try again."
fi

# 2. Tools
command -v npm >/dev/null 2>&1 || give_up "Node.js isn't installed. Install Node 20+ from https://nodejs.org, then try again."
[ -f server.js ] || give_up "This file has to stay in the Q folder (server.js isn't here: $(pwd))."

# 3. Ollama
if ollama_is_up; then
  say_ok "Ollama is running"
else
  say_todo "Ollama isn't running. Opening the Ollama app…"
  open -a Ollama 2>/dev/null || give_up "Couldn't open the Ollama app. Install it from https://ollama.com/download, then try again."
  for _ in $(seq 1 60); do
    ollama_is_up && break
    sleep 1
  done
  ollama_is_up || give_up "Ollama didn't start within a minute. Open it yourself, then try again."
  say_ok "Ollama is running"
fi

# 4. Open the page as soon as the server answers (gives up after a minute).
(
  for _ in $(seq 1 120); do
    if q_is_up; then open "$URL"; exit 0; fi
    sleep 0.5
  done
) &
WAITER=$!
trap 'kill "$WAITER" 2>/dev/null' EXIT

# 5. The server runs here until you press Ctrl+C or close the window.
say_todo "Starting the Q server (Ctrl+C or close this window to stop)"
Q_PORT="$PORT" npm start
echo
echo "  Q has stopped."
echo
