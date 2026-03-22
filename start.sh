#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ScaleAI — Start All Services
#
#  Usage:
#    chmod +x start.sh   (first time only)
#    ./start.sh
#
#  Starts:
#    [1] Meta Integration Engine  (optimizer + API server on :3001)
#    [2] React Frontend           (http://localhost:5173)
#
#  Press Ctrl+C once to stop everything cleanly.
# ─────────────────────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"
META="$ROOT/meta-integration"

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  ScaleAI — Go-Live Launcher${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ ! -f "$META/.env" ]; then
  echo -e "  ${RED}❌  $META/.env not found.${RESET}"
  echo -e "     Copy .env.example → .env and fill in your credentials.\n"
  exit 1
fi

if ! grep -q "META_ACCESS_TOKEN=.\+" "$META/.env" 2>/dev/null; then
  echo -e "  ${YELLOW}⚠   META_ACCESS_TOKEN looks empty in .env — you may get demo data only.${RESET}"
fi

if [ ! -d "$META/node_modules" ]; then
  echo -e "  ${YELLOW}Installing meta-integration dependencies…${RESET}"
  cd "$META" && npm install --silent
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo -e "  ${YELLOW}Installing frontend dependencies…${RESET}"
  cd "$ROOT" && npm install --silent
fi

# ── Log files ─────────────────────────────────────────────────────────────────
ENGINE_LOG="$META/engine.log"

# ── Start services ────────────────────────────────────────────────────────────
echo -e "  ${DIM}Log: engine.log (in meta-integration/)${RESET}"
echo ""

# [1] Engine + API (src/index.js starts both optimizer and API server on :3001)
echo -e "  ${BOLD}[1]${RESET} Starting Meta Integration Engine + API Server…"
cd "$META" && node src/index.js > "$ENGINE_LOG" 2>&1 &
ENGINE_PID=$!
echo -e "      ${GREEN}✓${RESET}  PID ${ENGINE_PID}  ${DIM}(tail -f meta-integration/engine.log)${RESET}"

# Give the engine a moment to initialise before the frontend opens
sleep 1

# [2] React Frontend
echo -e "  ${BOLD}[2]${RESET} Starting React frontend…"
cd "$ROOT" && npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!
echo -e "      ${GREEN}✓${RESET}  PID ${FRONTEND_PID}  ${DIM}http://localhost:5173${RESET}"

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  ✅  All services running.${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Open in browser:${RESET}  ${CYAN}http://localhost:5173${RESET}"
echo ""
echo -e "  ${DIM}API endpoints:${RESET}"
echo -e "    ${CYAN}GET  ${RESET}http://localhost:3001/api/status"
echo -e "    ${CYAN}GET  ${RESET}http://localhost:3001/api/live-feed"
echo -e "    ${CYAN}GET  ${RESET}http://localhost:3001/api/action-log"
echo -e "    ${CYAN}POST ${RESET}http://localhost:3001/api/action"
echo ""
echo -e "  ${DIM}Press Ctrl+C to stop all services.${RESET}"
echo ""

# ── Clean shutdown ────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "  ${YELLOW}Stopping all services…${RESET}"
  kill $ENGINE_PID $FRONTEND_PID 2>/dev/null
  wait $ENGINE_PID $FRONTEND_PID 2>/dev/null
  echo -e "  ${GREEN}✓  Stopped cleanly.${RESET}"
  echo ""
  exit 0
}

trap cleanup INT TERM

# Wait for all background processes
wait
