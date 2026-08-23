#!/bin/bash

# 🔄 Saltacode - Reset Solo Dati
# Mantiene servizi attivi ma resetta database e riavvia

set -e

echo "🔄 SALTACODE RESET DATI"
echo "======================"
echo ""
echo "Questo script:"
echo "✅ Mantiene: servizi, configurazioni, codice"
echo "🗑️  Resetta: database, utenti, ticket, code"
echo ""
read -p "Continuare? [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi

# Funzione per log
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "🛑 Fermando backend..."
pm2 stop saltacode-backend

log "🗄️  Resettando database..."
cd /opt/saltacode/backend

# Reset completo database
sudo -u postgres dropdb --if-exists saltacode
sudo -u postgres createdb saltacode -O saltacode

# Rigenera schema
npx prisma migrate reset --force
npx prisma db push
npx prisma db seed

log "🚀 Riavviando backend..."
pm2 restart saltacode-backend
pm2 save

log "🔍 Verifica stato..."
sleep 3

echo ""
echo "📊 STATO SERVIZI:"
pm2 status
echo ""

# Test health
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ Backend: OK"
else
    echo "❌ Backend: ERROR"
fi

# Test frontend
if curl -f http://localhost/ >/dev/null 2>&1; then
    echo "✅ Frontend: OK"
else  
    echo "❌ Frontend: ERROR"
fi

echo ""
echo "🎯 RESET COMPLETATO!"
echo "==================="
echo ""
echo "Credenziali default ripristinate:"
echo "  Username: superadmin"
echo "  Password: Change123!"
echo ""
echo "🌐 Accedi su: http://$(hostname -I | awk '{print $1}')/"

log "✅ Reset dati completato!"