#!/bin/bash
# Script per installare il cron job di backup automatico

APP_USER="saltacode"
APP_DIR="/opt/saltacode"

echo "Installazione cron job backup automatico per utente $APP_USER..."

# Verifica che l'utente esista
if ! id "$APP_USER" &>/dev/null; then
    echo "❌ Errore: utente $APP_USER non trovato"
    exit 1
fi

# Verifica che la directory dell'app esista
if [ ! -d "$APP_DIR" ]; then
    echo "❌ Errore: directory $APP_DIR non trovata"
    exit 1
fi

# Crea directory backup se non esiste
sudo mkdir -p /var/backups/saltacode
sudo chown $APP_USER:$APP_USER /var/backups/saltacode
sudo chmod 755 /var/backups/saltacode

# Installa il cron job per l'utente saltacode
echo "0 3 * * * cd $APP_DIR/backend && /usr/bin/node dist/scripts/daily-backup.js >> /var/log/saltacode/backup.log 2>&1" | sudo -u $APP_USER crontab -

# Verifica che sia stato installato
echo "✅ Cron job installato:"
sudo -u $APP_USER crontab -l

echo ""
echo "📅 Il backup automatico verrà eseguito ogni giorno alle 03:00"
echo "📁 Backup salvati in: /var/backups/saltacode/"
echo "📜 Log backup in: /var/log/saltacode/backup.log"
echo ""
echo "Per verificare manualmente il backup:"
echo "   sudo -u $APP_USER cd $APP_DIR/backend && node dist/scripts/daily-backup.js"