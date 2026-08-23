#!/bin/bash
# Ricostruisce e ridistribuisce il frontend dopo un git pull
set -e

echo "==> Build frontend..."
cd "$(dirname "$0")/frontend"
npm run build

echo "==> Deploy in /opt/saltacode/frontend/dist/..."
rm -rf /opt/saltacode/frontend/dist/assets/*
cp -r dist/* /opt/saltacode/frontend/dist/

echo "==> Fatto! Fai Ctrl+Shift+R nel browser."
