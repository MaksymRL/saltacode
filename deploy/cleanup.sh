#!/bin/bash

# 🧹 Saltacode - Script di Pulizia Completa
# Rimuove tutto il deployment e ricomincia da capo

set -e

echo "🧹 SALTACODE CLEANUP - Rimozione completa deployment"
echo "=================================================="
echo ""
echo "⚠️  ATTENZIONE: Questo script rimuoverà:"
echo "   - Tutti i servizi PM2 e systemd"  
echo "   - Database PostgreSQL e tutti i dati"
echo "   - Configurazione Nginx"
echo "   - Directory /opt/saltacode"
echo "   - Utente saltacode"
echo ""
read -p "Sei sicuro di voler continuare? [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi
echo ""

# Funzione per log con timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Funzione per gestire errori non critici
safe_run() {
    if ! "$@" 2>/dev/null; then
        log "⚠️  Warning: $* failed (continuing...)"
    fi
}

# 1. STOP E RIMOZIONE SERVIZI
log "🛑 Fermando tutti i servizi..."

# Stop PM2 processes
safe_run pm2 delete saltacode-backend
safe_run pm2 delete all
safe_run pm2 save --force

# Stop systemd services
safe_run sudo systemctl stop saltacode-pm2
safe_run sudo systemctl disable saltacode-pm2
safe_run sudo rm -f /etc/systemd/system/saltacode-pm2.service

safe_run sudo systemctl stop nginx
safe_run sudo systemctl disable nginx

safe_run sudo systemctl stop postgresql
safe_run sudo systemctl disable postgresql

log "✅ Servizi fermati"

# 2. RIMOZIONE DATABASE
log "🗄️  Rimuovendo database PostgreSQL..."

# Drop database e utente
safe_run sudo -u postgres dropdb saltacode
safe_run sudo -u postgres dropuser saltacode

# Rimuovi PostgreSQL completamente
safe_run sudo apt-get remove --purge postgresql postgresql-* -y
safe_run sudo rm -rf /var/lib/postgresql/
safe_run sudo rm -rf /etc/postgresql/
safe_run sudo deluser postgres

log "✅ Database rimosso"

# 3. RIMOZIONE NGINX
log "🌐 Rimuovendo Nginx..."

# Remove nginx config
safe_run sudo rm -f /etc/nginx/sites-enabled/saltacode
safe_run sudo rm -f /etc/nginx/sites-available/saltacode

# Remove nginx completely
safe_run sudo apt-get remove --purge nginx nginx-* -y
safe_run sudo rm -rf /etc/nginx/
safe_run sudo rm -rf /var/log/nginx/

log "✅ Nginx rimosso"

# 4. RIMOZIONE NODE.JS E PM2
log "📦 Rimuovendo Node.js e PM2..."

# Remove PM2 globally
safe_run npm uninstall -g pm2

# Remove Node.js (if installed via NodeSource)
safe_run sudo apt-get remove --purge nodejs npm -y
safe_run sudo rm -rf /usr/lib/node_modules/
safe_run sudo rm -rf ~/.npm
safe_run sudo rm -rf ~/.pm2

# Remove NodeSource repository
safe_run sudo rm -f /etc/apt/sources.list.d/nodesource.list
safe_run sudo apt-key del 68576280

log "✅ Node.js e PM2 rimossi"

# 5. RIMOZIONE UTENTE E DIRECTORY
log "👤 Rimuovendo utente saltacode e directory..."

# Stop any processes running as saltacode user
safe_run sudo pkill -u saltacode

# Remove user
safe_run sudo deluser --remove-home saltacode

# Remove application directory
safe_run sudo rm -rf /opt/saltacode

log "✅ Utente e directory rimossi"

# 6. PULIZIA CERTIFICATI SSL (se presenti)
log "🔒 Rimuovendo certificati SSL..."

safe_run sudo rm -rf /etc/ssl/private/saltacode*
safe_run sudo rm -rf /etc/ssl/certs/saltacode*

log "✅ Certificati rimossi"

# 7. PULIZIA CRON JOBS
log "⏰ Rimuovendo cron jobs..."

# Remove any saltacode cron jobs
safe_run sudo crontab -l | grep -v saltacode | sudo crontab -
safe_run crontab -l | grep -v saltacode | crontab -

log "✅ Cron jobs rimossi"

# 8. PULIZIA LOGS
log "📝 Rimuovendo log files..."

safe_run sudo rm -rf /var/log/saltacode*
safe_run sudo rm -rf /var/log/pm2
safe_run sudo rm -rf ~/.pm2/logs

log "✅ Log files rimossi"

# 9. AGGIORNAMENTO SISTEMA
log "🔄 Aggiornando sistema..."

sudo apt-get update
sudo apt-get autoremove -y
sudo apt-get autoclean

# Reload systemd dopo rimozione servizi
sudo systemctl daemon-reload
sudo systemctl reset-failed

log "✅ Sistema aggiornato"

# 10. VERIFICA PULIZIA
log "🔍 Verifica pulizia completata..."

echo ""
echo "📊 STATO PULIZIA:"
echo "=================="

# Check services
echo -n "PostgreSQL: "
if systemctl is-active --quiet postgresql; then
    echo "❌ Ancora attivo"
else
    echo "✅ Rimosso"
fi

echo -n "Nginx: "
if systemctl is-active --quiet nginx; then
    echo "❌ Ancora attivo"  
else
    echo "✅ Rimosso"
fi

echo -n "Node.js: "
if command -v node &> /dev/null; then
    echo "❌ Ancora presente ($(node --version))"
else
    echo "✅ Rimosso"
fi

echo -n "PM2: "
if command -v pm2 &> /dev/null; then
    echo "❌ Ancora presente"
else
    echo "✅ Rimosso"
fi

echo -n "Utente saltacode: "
if id "saltacode" &>/dev/null; then
    echo "❌ Ancora presente"
else
    echo "✅ Rimosso"
fi

echo -n "Directory /opt/saltacode: "
if [ -d "/opt/saltacode" ]; then
    echo "❌ Ancora presente"
else
    echo "✅ Rimossa"
fi

echo ""
echo "🎯 PULIZIA COMPLETATA!"
echo "====================="
echo ""
echo "Il sistema è ora completamente pulito."
echo "Puoi rilanciare il deployment con:"
echo ""
echo "  sudo ./setup.sh"
echo ""
echo "📋 Opzioni per il riavvio:"
echo "  1. Stesso codice:     sudo ./setup.sh"
echo "  2. Nuovo codice:      copia nuovi files → sudo ./setup.sh"
echo "  3. VM fresca:         reinstalla Ubuntu → sudo ./setup.sh"
echo ""

log "🧹 Script cleanup completato con successo!"