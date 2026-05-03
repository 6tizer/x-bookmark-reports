#!/bin/bash
# Double-click in Finder (or add to macOS Login Items) to start the Next.js UI
# and open your default browser. Keep this Terminal window open while using the UI.
set -e
# Local dev must bypass system HTTP proxy, or 127.0.0.1 is forwarded and returns 502 (breaks Cursor Simple Browser too).
export NO_PROXY="127.0.0.1,localhost,::1,0.0.0.0"
export no_proxy="$NO_PROXY"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT/ui"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js 18+ first."
  read -r _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Running npm install…"
  npm install
fi

echo "Starting dashboard at http://127.0.0.1:3001 (also http://localhost:3001)"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -n "$LAN_IP" ]; then
  echo "If Simple Browser shows 502 (proxy), try: http://${LAN_IP}:3001"
fi
echo "If you see 500 / white screen / 'Cannot find module ./NNN.js': quit server, run: cd ui && npm run dev:clean"
# Open default browser once the dev server is accepting connections
(
  for i in $(seq 1 40); do
    if curl --noproxy '*' -fsS -o /dev/null "http://127.0.0.1:3001/" 2>/dev/null; then
      open "http://127.0.0.1:3001/"
      exit 0
    fi
    sleep 0.25
  done
  echo "Timed out waiting for server; open http://127.0.0.1:3001 manually."
) &

exec npm run dev
