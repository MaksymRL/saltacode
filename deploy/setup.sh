#!/bin/bash
# =============================================================================
# Saltacode — Script di setup completo per Ubuntu 22.04 / 24.04
# Eseguire come root oppure con sudo: sudo bash setup.sh
# =============================================================================
set -e

APP_DIR="/opt/saltacode"
APP_USER="saltacode"
DB_NAME="saltacode_db"
DB_USER="saltacode"
DB_PASS="saltacode_db"         # ⚠️ cambiare in produzione
JWT_SECRET="cambia-questo-segreto-jwt-in-produzione"
PORT_BACKEND=3000

echo "============================================"
echo "  Saltacode — Setup Ubuntu"
echo "============================================"

# ── 1. Aggiorna pacchetti ──────────────────────────────────────────────────
echo "[1/9] Aggiornamento pacchetti..."
apt-get update -y && apt-get upgrade -y

# ── 2. Installa Node.js 20 LTS ────────────────────────────────────────────
echo "[2/9] Installazione Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "Node: $(node -v)"
echo "NPM:  $(npm -v)"

# ── 3. Installa PostgreSQL 15 ─────────────────────────────────────────────
echo "[3/9] Installazione PostgreSQL..."
apt-get install -y postgresql postgresql-contrib

systemctl enable postgresql
systemctl start postgresql

# Crea utente e database
echo "[3/9] Creazione DB..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || echo "  utente già esistente"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "  database già esistente"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# ── 4. Installa Nginx ─────────────────────────────────────────────────────
echo "[4/9] Installazione Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 5. Installa PM2 (process manager Node.js) ─────────────────────────────
echo "[5/9] Installazione PM2..."
npm install -g pm2

# ── 6. Crea utente di sistema dedicato ───────────────────────────────────
echo "[6/9] Creazione utente sistema '$APP_USER'..."
id -u $APP_USER &>/dev/null || useradd -r -s /bin/bash -d $APP_DIR $APP_USER

# ── 7. Copia file applicazione ─────────────────────────────────────────────
echo "[7/9] Copia files in $APP_DIR..."
mkdir -p $APP_DIR
cp -r "$(dirname "$0")/.." $APP_DIR/source 2>/dev/null || true

# Se la cartella saltacode/ è nella stessa dir dello script:
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SALTACODE_DIR="$(dirname "$SCRIPT_DIR")"

mkdir -p $APP_DIR/backend
mkdir -p $APP_DIR/frontend

cp -r "$SALTACODE_DIR/backend/"* $APP_DIR/backend/
cp -r "$SALTACODE_DIR/frontend/"* $APP_DIR/frontend/

# Crea .env di produzione
cat > $APP_DIR/backend/.env << EOF
NODE_ENV=production
PORT=$PORT_BACKEND
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public
JWT_SECRET=$JWT_SECRET
BCRYPT_COST_FACTOR=12
CORS_ORIGIN=*
LOG_DIR=/var/log/saltacode
EOF

mkdir -p /var/log/saltacode
chown -R $APP_USER:$APP_USER /var/log/saltacode
chown -R $APP_USER:$APP_USER $APP_DIR

# ── 8. Installa dipendenze e builda ──────────────────────────────────────
echo "[8/9] Build backend..."
cd $APP_DIR/backend
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy   # applica TUTTE le migrazioni in ordine (inclusa multi_ruolo)
npm run build || true   # ignora se il build fallisce (tsx runtime è ok)

echo "[8/9] Build frontend..."
cd $APP_DIR/frontend
npm ci
npm run build

# ── 9. Configura PM2 ─────────────────────────────────────────────────────
echo "[9/9] Configurazione PM2..."

cat > $APP_DIR/ecosystem.config.cjs << 'EOFPM2'
module.exports = {
  apps: [
    {
      name: 'saltacode-backend',
      cwd: '/opt/saltacode/backend',
      script: 'src/server.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/saltacode/pm2-error.log',
      out_file: '/var/log/saltacode/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
EOFPM2

# Installa tsx globalmente per PM2
npm install -g tsx

# Avvia l'app
sudo -u $APP_USER pm2 start $APP_DIR/ecosystem.config.cjs
sudo -u $APP_USER pm2 save

# Registra PM2 per l'avvio automatico
env PATH=$PATH:/usr/bin pm2 startup systemd -u $APP_USER --hp $APP_DIR
systemctl enable pm2-$APP_USER

# ── Configura Nginx ────────────────────────────────────────────────────────
echo "[9/9] Configurazione Nginx..."
cat > /etc/nginx/sites-available/saltacode << EOFNGINX
server {
    listen 80;
    server_name _;   # risponde a qualsiasi hostname/IP

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Frontend statico (React build)
    root /opt/saltacode/frontend/dist;
    index index.html;

    # SPA: tutte le route non trovate → index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API → backend Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Proxy WebSocket → backend
    location /ws {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;   # WebSocket longpoll
        proxy_send_timeout 3600s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:$PORT_BACKEND;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
EOFNGINX

# Abilita il sito
ln -sf /etc/nginx/sites-available/saltacode /etc/nginx/sites-enabled/saltacode
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx

# ── Installa backup automatico ─────────────────────────────────────────
echo "[9/9] Configurazione backup automatico..."

# Crea directory backup
mkdir -p /var/backups/saltacode
chown $APP_USER:$APP_USER /var/backups/saltacode

# Installa cron job per backup giornaliero (3:00 AM)
(sudo -u $APP_USER crontab -l 2>/dev/null; echo "0 3 * * * cd $APP_DIR/backend && /usr/bin/node dist/scripts/daily-backup.js >> /var/log/saltacode/backup.log 2>&1") | sudo -u $APP_USER crontab -

echo ""
echo "============================================"
echo "  ✅ Setup completato!"
echo "============================================"
echo ""
echo "  🌐 Accesso:"
echo "    Frontend: http://$(hostname -I | awk '{print $1}')"
echo "    Monitor:  http://$(hostname -I | awk '{print $1}')/monitor"
echo "    Health:   http://$(hostname -I | awk '{print $1}')/health"
echo ""
echo "  🔐 Credenziali iniziali:"
echo "    username: superadmin"
echo "    password: Admin@Saltacode1"
echo ""
echo "  📊 Monitoraggio:"
echo "    pm2 status              → stato processi"
echo "    pm2 logs saltacode-backend  → log backend"
echo "    pm2 restart saltacode-backend"
echo "    systemctl status nginx"
echo ""
echo "  💾 Backup automatico:"
echo "    Esecuzione: ogni giorno alle 03:00"
echo "    Directory: /var/backups/saltacode/"
echo "    Log: /var/log/saltacode/backup.log"
echo "    Test manuale: sudo -u $APP_USER node $APP_DIR/backend/dist/scripts/daily-backup.js"
echo ""
