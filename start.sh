#!/usr/bin/env bash
# One-command dev startup — handy for local dev and for screen-sharing during
# interviews so you're not typing multiple commands in multiple terminals.
#
# Usage: ./start.sh
# Stop everything:  Ctrl+C  (or ./start.sh stop)

set -euo pipefail
cd "$(dirname "$0")"

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
BACKEND_DIR="apps/browser-server"
FRONTEND_DIR="apps/frontend"

if [[ "${1:-}" == "stop" ]]; then
  echo "Stopping Xvfb and dev servers..."
  pkill -f "Xvfb $DISPLAY_NUM" 2>/dev/null || true
  pkill -f "bun run dev" 2>/dev/null || true
  echo "Done."
  exit 0
fi

# --- 1. Start Xvfb (virtual display) if it isn't already running ---
if pgrep -f "Xvfb $DISPLAY_NUM" > /dev/null; then
  echo "✅ Xvfb already running on $DISPLAY_NUM"
else
  echo "🖥️  Starting Xvfb on $DISPLAY_NUM..."
  Xvfb "$DISPLAY_NUM" -screen 0 1440x900x24 &
  sleep 1
fi
export DISPLAY="$DISPLAY_NUM"

# --- 2. Sanity check required tools ---
for bin in ffmpeg bun; do
  if ! command -v "$bin" &> /dev/null; then
    echo "❌ '$bin' not found on PATH. Install it before continuing."
    exit 1
  fi
done

# --- 3. Start backend and frontend, tagging each line so it's clear
#        which process is talking in a shared terminal ---
cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0
}
trap cleanup INT TERM

echo "🚀 Starting backend (http://localhost:3001)..."
(cd "$BACKEND_DIR" && bun run dev 2>&1 | sed 's/^/[backend]  /') &

sleep 2

echo "🚀 Starting frontend (http://localhost:3000)..."
(cd "$FRONTEND_DIR" && bun run dev 2>&1 | sed 's/^/[frontend] /') &

echo ""
echo "✅ All set. Open http://localhost:3000"
echo "   Press Ctrl+C to stop everything."
wait
