#!/bin/bash
# ============================================================
# Saltacode — Script di installazione su nuova VM Ubuntu
# Eseguire come utente con sudo (non come root)
# Uso: bash install-new-vm.sh
# ============================================================
set -euo pipefail

SALTACODE_USER="saltacode"
DB_NAME="saltacode_db"
DB_USER="saltacode"
DB_PASS="saltacode_db"
APP_DIR="/opt/saltacode"
LOG_DIR="/var/log/saltacode"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # cartella del progetto
NODE_VERSION="22"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}"; exit 1; }
step() { echo -e "\n${YELLOW}━━━ $* ━━━${NC}"; }

# ── 0. Prerequisiti ───────────────────────────────────────────────────────────
step "0. Verifica prerequisiti"
[[ $EUID -eq 0 ]] && err "Non eseguire come root. Usa un utente con sudo."
command -v sudo >/dev/null || err "sudo non disponibile"
ok "Utente corrente: $(whoami)"

# ── 1. Aggiornamento sistema ──────────────────────────────────────────────────
step "1. Aggiornamento sistema"
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl wget git nginx postgresql postgresql-contrib \
  espeak-ng libttspico-utils \
  avahi-daemon avahi-utils \
  chrony build-essential
ok "Pacchetti installati"

# Configura mDNS: la macchina risponde a "saltacode.local" su qualsiasi rete
sudo hostnamectl set-hostname saltacode 2>/dev/null || true
cat > /tmp/saltacode-http.service << 'AVAHIEOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Saltacode su %h</name>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
    <txt-record>path=/</txt-record>
  </service>
</service-group>
AVAHIEOF
sudo cp /tmp/saltacode-http.service /etc/avahi/services/saltacode.service
sudo systemctl enable --now avahi-daemon 2>/dev/null || true
ok "mDNS configurato — accessibile come http://saltacode.local/"

# ── 2. Orologio NTP ──────────────────────────────────────────────────────────
step "2. Configurazione NTP (orologio)"
# Corregge subito l'orario
sudo chronyc makestep 2>/dev/null || true
# Configura makestep permanente e script post-resume
sudo sed -i 's/^makestep 1 3/makestep 1 -1/' /etc/chrony.conf 2>/dev/null || \
sudo sed -i 's/^makestep 1 3/makestep 1 -1/' /etc/chrony/chrony.conf 2>/dev/null || true
sudo systemctl restart chrony 2>/dev/null || true

# Script auto-correzione dopo resume VM
cat > /tmp/99-fix-clock.sh << 'CLOCKSCRIPT'
#!/bin/bash
case "$1/$2" in
  post/*)
    sleep 2
    /usr/bin/chronyc makestep
    /usr/bin/logger "saltacode: orologio corretto dopo resume"
    ;;
esac
CLOCKSCRIPT
sudo cp /tmp/99-fix-clock.sh /lib/systemd/system-sleep/99-fix-clock.sh
sudo chmod +x /lib/systemd/system-sleep/99-fix-clock.sh
ok "NTP configurato + script post-resume installato"

# ── 3. Node.js ───────────────────────────────────────────────────────────────
step "3. Node.js $NODE_VERSION"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "Node.js $(node -v) — npm $(npm -v)"

# ── 4. Utente di sistema ──────────────────────────────────────────────────────
step "4. Utente sistema '$SALTACODE_USER'"
if ! id "$SALTACODE_USER" &>/dev/null; then
  sudo useradd --system --create-home --shell /bin/bash "$SALTACODE_USER"
  ok "Utente creato"
else
  ok "Utente già esistente"
fi

# ── 5. PM2 ───────────────────────────────────────────────────────────────────
step "5. PM2 (process manager)"
if ! sudo -u "$SALTACODE_USER" npm list -g pm2 &>/dev/null; then
  sudo npm install -g pm2
fi
# Avvio automatico al boot
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$SALTACODE_USER" --hp "/home/$SALTACODE_USER" | tail -1 | sudo bash -
ok "PM2 installato"

# ── 6. PostgreSQL ─────────────────────────────────────────────────────────────
step "6. Database PostgreSQL"
sudo systemctl enable --now postgresql

# Crea utente e database se non esistono
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
ok "Database PostgreSQL configurato"

# ── 7. Struttura directory ────────────────────────────────────────────────────
step "7. Directory applicazione"
sudo mkdir -p "$APP_DIR/backend/src"
sudo mkdir -p "$APP_DIR/frontend/dist"
sudo mkdir -p "$LOG_DIR"
sudo chown -R "$SALTACODE_USER:$SALTACODE_USER" "$APP_DIR" "$LOG_DIR"
ok "Directory create"

# ── 8. Copia sorgenti ─────────────────────────────────────────────────────────
step "8. Copia sorgenti dal repository"
# Backend
sudo -u "$SALTACODE_USER" cp -r "$REPO_DIR/backend/src/"* "$APP_DIR/backend/src/"
sudo -u "$SALTACODE_USER" cp "$REPO_DIR/backend/package.json" "$APP_DIR/backend/"
sudo -u "$SALTACODE_USER" cp "$REPO_DIR/backend/package-lock.json" "$APP_DIR/backend/" 2>/dev/null || true
sudo -u "$SALTACODE_USER" cp "$REPO_DIR/backend/tsconfig.json" "$APP_DIR/backend/"
sudo -u "$SALTACODE_USER" cp -r "$REPO_DIR/backend/prisma" "$APP_DIR/backend/"

# File .env backend
cat > /tmp/backend.env << ENVEOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public
JWT_SECRET=$(openssl rand -hex 32)
BCRYPT_COST_FACTOR=12
CORS_ORIGIN=*
LOG_DIR=${LOG_DIR}
ENVEOF
sudo -u "$SALTACODE_USER" cp /tmp/backend.env "$APP_DIR/backend/.env"

# Ecosystem PM2
sudo -u "$SALTACODE_USER" cp "$REPO_DIR/deploy/saltacode.service" /tmp/ 2>/dev/null || true
cat > /tmp/ecosystem.cjs << ECOEOF
module.exports = {
  apps: [{
    name: 'saltacode-backend',
    cwd: '${APP_DIR}/backend',
    script: 'src/server.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' },
    error_file: '${LOG_DIR}/pm2-error.log',
    out_file: '${LOG_DIR}/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
ECOEOF
sudo -u "$SALTACODE_USER" cp /tmp/ecosystem.cjs "$APP_DIR/ecosystem.config.cjs"

# Asset logo
sudo mkdir -p "$APP_DIR/backend/assets"
[[ -f "$REPO_DIR/backend/assets/logo-test.png" ]] && \
  sudo -u "$SALTACODE_USER" cp "$REPO_DIR/backend/assets/logo-test.png" "$APP_DIR/backend/src/logo-test.png"
ok "Sorgenti copiati"

# ── 9. Dipendenze npm backend ──────────────────────────────────────────────────
step "9. Dipendenze npm backend"
sudo -u "$SALTACODE_USER" bash -c "cd $APP_DIR/backend && npm install --production 2>&1 | tail -3"
ok "npm install completato"

# ── 10. Schema database + seed ────────────────────────────────────────────────
step "10. Migrazione database"
sudo -u "$SALTACODE_USER" bash -c "
  cd $APP_DIR/backend
  export DATABASE_URL='postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public'
  npx prisma migrate deploy 2>&1 | tail -5
  npx prisma generate 2>&1 | tail -3
"
ok "Schema database applicato"

echo ""
warn "Vuoi eseguire il seed (crea dati iniziali: superadmin, ruoli ecc.)? [s/n]"
read -r risposta
if [[ "$risposta" =~ ^[Ss]$ ]]; then
  sudo -u "$SALTACODE_USER" bash -c "
    cd $APP_DIR/backend
    export DATABASE_URL='postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public'
    npx tsx prisma/seed.ts 2>&1 | tail -5
  "
  ok "Seed completato"
fi

# ── 11. Build frontend ────────────────────────────────────────────────────────
step "11. Build frontend"
cd "$REPO_DIR/frontend"
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -5
cp -r dist/* "$APP_DIR/frontend/dist/"
# Audio DingLing
[[ -f "$REPO_DIR/frontend/public/DingLing.wav" ]] && \
  cp "$REPO_DIR/frontend/public/DingLing.wav" "$APP_DIR/frontend/dist/"
[[ -f "$REPO_DIR/frontend/public/logo.svg" ]] && \
  cp "$REPO_DIR/frontend/public/logo.svg" "$APP_DIR/frontend/dist/"
ok "Frontend buildato e copiato"

# ── 12. Nginx ─────────────────────────────────────────────────────────────────
step "12. Configurazione Nginx"
cat > /tmp/saltacode-nginx.conf << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    root /opt/saltacode/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
NGINXEOF
sudo cp /tmp/saltacode-nginx.conf /etc/nginx/sites-available/saltacode
sudo ln -sf /etc/nginx/sites-available/saltacode /etc/nginx/sites-enabled/saltacode
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
ok "Nginx configurato"

# ── 13. Avvio backend ─────────────────────────────────────────────────────────
step "13. Avvio backend con PM2"
sudo -u "$SALTACODE_USER" bash -c "
  pm2 start $APP_DIR/ecosystem.config.cjs
  pm2 save
" 2>&1 | tail -5
ok "Backend avviato"

# ── 14. Verifica finale ───────────────────────────────────────────────────────
step "14. Verifica installazione"
sleep 4
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health)
if [[ "$HTTP" == "200" ]]; then
  ok "API risponde correttamente (HTTP $HTTP)"
else
  warn "API risponde HTTP $HTTP — controlla i log: pm2 logs saltacode-backend"
fi

IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         INSTALLAZIONE COMPLETATA                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Accesso per IP:    ${GREEN}http://${IP}/${NC}"
echo -e "  Accesso per nome:  ${GREEN}http://saltacode.local/${NC}  (qualsiasi rete)"
echo -e "  Monitor:           ${GREEN}http://saltacode.local/monitor${NC}"
echo ""
echo -e "  Credenziali iniziali superadmin:"
echo -e "  Username: ${GREEN}superadmin${NC}"
echo -e "  Password: ${GREEN}Admin@Saltacode1${NC}  (cambiarla al primo accesso)"
echo ""
echo -e "  Comandi utili:"
echo -e "  ${YELLOW}sudo -u saltacode pm2 status${NC}          # stato backend"
echo -e "  ${YELLOW}sudo -u saltacode pm2 logs${NC}            # log in tempo reale"
echo -e "  ${YELLOW}sudo -u saltacode pm2 restart 0${NC}       # riavvia backend"
echo -e "  ${YELLOW}sudo nginx -t && sudo systemctl reload nginx${NC}  # ricarica nginx"
echo ""
