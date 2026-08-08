#!/bin/bash
# Script di installazione Saltacode Queue Manager
# Ubuntu 22.04 LTS
# Uso: sudo bash install.sh

set -e  # Interrompi al primo errore

INSTALL_DIR="/opt/saltacode"
DB_NAME="saltacode_db"
DB_USER="saltacode"
DB_PASS=$(openssl rand -base64 16)
APP_USER="saltacode"
SSL_DIR="/etc/ssl/saltacode"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo " Installazione Saltacode Queue Manager"
echo "=========================================="

# Passo 1: Aggiornamento sistema
echo "[1/14] Aggiornamento pacchetti sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# Passo 2: Node.js 20 LTS
echo "[2/14] Installazione Node.js 20 LTS..."
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Passo 3: PostgreSQL 15
echo "[3/14] Installazione PostgreSQL 15..."
if ! command -v psql &> /dev/null; then
    apt-get install -y postgresql-15 postgresql-client-15
fi
systemctl start postgresql
systemctl enable postgresql

# Passo 4: Database e utente PostgreSQL
echo "[4/14] Configurazione database PostgreSQL..."
sudo -u postgres psql -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
      CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
    END IF;
  END
  \$\$;
"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true

# Passo 5: Utente di sistema
echo "[5/14] Creazione utente di sistema '$APP_USER'..."
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/false --home "$INSTALL_DIR" "$APP_USER"
fi

# Passo 6: Copia file applicazione
echo "[6/14] Copia file applicazione in $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r "$SOURCE_DIR/backend" "$INSTALL_DIR/"
cp -r "$SOURCE_DIR/frontend" "$INSTALL_DIR/"
cp -r "$SOURCE_DIR/deploy" "$INSTALL_DIR/"

# Passo 7: File di configurazione .env
echo "[7/14] Creazione file .env..."
JWT_SECRET=$(openssl rand -base64 48)
cat > "$INSTALL_DIR/backend/.env" << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public
JWT_SECRET=$JWT_SECRET
BCRYPT_COST_FACTOR=12
LOG_DIR=/var/log/saltacode
EOF

# Passo 8: Dipendenze Node.js
echo "[8/14] Installazione dipendenze backend..."
cd "$INSTALL_DIR/backend"
npm ci --omit=dev

echo "[8b/14] Build frontend..."
cd "$INSTALL_DIR/frontend"
npm ci
npm run build

# Passo 9: Migrazioni DB Prisma
echo "[9/14] Esecuzione migrazioni database..."
cd "$INSTALL_DIR/backend"
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public" npx prisma migrate deploy
npx prisma generate

# Passo 10: Build TypeScript backend
echo "[10/14] Build TypeScript backend..."
npm run build

# Passo 11: Certificato SSL self-signed
echo "[11/14] Generazione certificato SSL..."
mkdir -p "$SSL_DIR"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -subj "/C=IT/ST=Italia/L=Locale/O=CISL/CN=saltacode"
chmod 600 "$SSL_DIR/key.pem"

# Passo 12: Nginx
echo "[12/14] Configurazione Nginx..."
apt-get install -y nginx
cp "$INSTALL_DIR/deploy/nginx.conf" /etc/nginx/sites-available/saltacode
ln -sf /etc/nginx/sites-available/saltacode /etc/nginx/sites-enabled/saltacode
rm -f /etc/nginx/sites-enabled/default
nginx -t  # Verifica configurazione
systemctl enable nginx
systemctl restart nginx

# Passo 13: Servizio systemd
echo "[13/14] Configurazione servizio systemd..."
mkdir -p /var/log/saltacode
chown "$APP_USER:$APP_USER" /var/log/saltacode
chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
cp "$INSTALL_DIR/deploy/saltacode.service" /etc/systemd/system/saltacode.service
systemctl daemon-reload
systemctl enable saltacode
systemctl start saltacode

# Backup cron giornaliero
echo "0 3 * * * $APP_USER pg_dump $DB_NAME | gzip > /var/backups/saltacode/backup_\$(date +\%Y-\%m-\%d).sql.gz && find /var/backups/saltacode -mtime +7 -delete" \
    > /etc/cron.d/saltacode-backup
mkdir -p /var/backups/saltacode
chown "$APP_USER:$APP_USER" /var/backups/saltacode

# Passo 14: Verifica health check
echo "[14/14] Verifica health check..."
sleep 3
HEALTH=$(curl -sk https://localhost/health || echo "FAILED")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo ""
    echo "=========================================="
    echo " Installazione completata!"
    echo " URL: https://$(hostname -I | awk '{print $1}')"
    echo " Monitor: https://$(hostname -I | awk '{print $1}')/monitor"
    echo "=========================================="
else
    echo ""
    echo "ATTENZIONE: health check non ha risposto come atteso."
    echo "Output: $HEALTH"
    echo "Verificare con: systemctl status saltacode"
    exit 1
fi
