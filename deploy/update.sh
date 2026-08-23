#!/bin/bash
# =============================================================================
# Saltacode — Script di aggiornamento (eseguire dopo ogni modifica al codice)
# sudo bash update.sh
# =============================================================================
set -e

APP_DIR="/opt/saltacode"
APP_USER="saltacode"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SALTACODE_DIR="$(dirname "$SCRIPT_DIR")"

echo "[1/4] Copia nuovi file..."
cp -r "$SALTACODE_DIR/backend/src" $APP_DIR/backend/
cp -r "$SALTACODE_DIR/backend/prisma" $APP_DIR/backend/

echo "[2/4] Migrazione DB (se necessario)..."
cd $APP_DIR/backend
npx prisma migrate deploy

echo "[3/4] Build frontend..."
cp -r "$SALTACODE_DIR/frontend/src" $APP_DIR/frontend/
cp "$SALTACODE_DIR/frontend/package.json" $APP_DIR/frontend/ 2>/dev/null || true
cd $APP_DIR/frontend
npm ci 2>/dev/null || true
npm run build

echo "[4/4] Riavvio backend..."
sudo -u $APP_USER pm2 restart saltacode-backend

echo "✅ Aggiornamento completato."
pm2 status
