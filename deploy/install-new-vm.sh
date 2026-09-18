#!/usr/bin/env bash
# ============================================================
# Saltacode — Script di installazione su nuova VM Ubuntu
# Eseguire come utente con sudo (NON come root)
#
# Uso:
#   bash deploy/install-new-vm.sh              # chiede se fare il seed
#   SEED=yes bash deploy/install-new-vm.sh     # seed automatico (non interattivo)
#   SEED=no  bash deploy/install-new-vm.sh     # salta il seed
#   REPO_DIR=/percorso/repo bash install-new-vm.sh
#
# Lo script è idempotente: può essere rieseguito sulla stessa VM.
# ============================================================
set -Eeuo pipefail
shopt -s nullglob

# ── Variabili (sovrascrivibili da ambiente) ───────────────────────────────────
SALTACODE_USER="${SALTACODE_USER:-saltacode}"
DB_NAME="${DB_NAME:-saltacode_db}"
DB_USER="${DB_USER:-saltacode}"
DB_PASS="${DB_PASS:-}"                 # se vuota, viene generata casualmente
APP_DIR="${APP_DIR:-/opt/saltacode}"
LOG_DIR="${LOG_DIR:-/var/log/saltacode}"
NODE_VERSION="${NODE_VERSION:-22}"
HOSTNAME_MDNS="${HOSTNAME_MDNS:-saltacode}"
SEED="${SEED:-ask}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
# NB: il testo passa come argomento, non come format string (niente sorprese con i '%')
ok()   { printf '%b[OK]  %s%b\n' "$GREEN"  "$*" "$NC"; }
warn() { printf '%b[!!]  %s%b\n' "$YELLOW" "$*" "$NC"; }
err()  { printf '%b[ERR] %s%b\n' "$RED"    "$*" "$NC" >&2; exit 1; }
step() { printf '\n%b=== %s ===%b\n' "$YELLOW" "$*" "$NC"; }

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT
trap 'rc=$?; printf "%b[ERR] comando fallito (exit %s) alla riga %s: %s%b\n" "$RED" "$rc" "$LINENO" "$BASH_COMMAND" "$NC" >&2; exit $rc' ERR

# ── 0. Prerequisiti ───────────────────────────────────────────────────────────
step "0. Verifica prerequisiti"
if [[ $EUID -eq 0 ]]; then
  err "Non eseguire come root. Usa un utente con sudo."
fi
command -v sudo >/dev/null || err "sudo non disponibile"
sudo -v || err "Servono privilegi sudo"

# Risoluzione robusta della cartella del repository:
# lo script può stare nella radice del repo o in una sottocartella (es. deploy/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${REPO_DIR:-}" ]]; then
  if [[ -d "$SCRIPT_DIR/backend" && -d "$SCRIPT_DIR/frontend" ]]; then
    REPO_DIR="$SCRIPT_DIR"
  else
    REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  fi
fi
[[ -d "$REPO_DIR/backend" && -d "$REPO_DIR/frontend" ]] \
  || err "Repository non trovato in '$REPO_DIR' (mancano backend/ e frontend/). Imposta REPO_DIR=..."
ok "Utente corrente: $(whoami)"
ok "Repository: $REPO_DIR"

# ── 1. Aggiornamento sistema ──────────────────────────────────────────────────
step "1. Aggiornamento sistema"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq

# Pacchetti indispensabili: se uno manca, l'installazione deve fermarsi
PKG_BASE=(curl wget git ca-certificates gnupg openssl rsync
          nginx postgresql postgresql-contrib
          avahi-daemon avahi-utils chrony build-essential)
sudo apt-get install -y -qq "${PKG_BASE[@]}"

# Pacchetti opzionali (TTS): non devono far fallire l'installazione
PKG_OPT=(espeak-ng libttspico-utils)
for pkg in "${PKG_OPT[@]}"; do
  if ! sudo apt-get install -y -qq "$pkg" 2>/dev/null; then
    warn "Pacchetto opzionale '$pkg' non disponibile su questa release — proseguo"
  fi
done
ok "Pacchetti installati"

# ── 1b. mDNS ──────────────────────────────────────────────────────────────────
step "1b. mDNS (saltacode.local)"
sudo hostnamectl set-hostname "$HOSTNAME_MDNS" || warn "hostnamectl non disponibile"
# Senza la voce in /etc/hosts, sudo diventa lentissimo (risoluzione hostname)
if ! grep -qE "^127\.0\.1\.1\s+.*\b${HOSTNAME_MDNS}\b" /etc/hosts; then
  printf '127.0.1.1 %s\n' "$HOSTNAME_MDNS" | sudo tee -a /etc/hosts >/dev/null
fi

sudo tee /etc/avahi/services/saltacode.service >/dev/null << 'AVAHIEOF'
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
sudo systemctl enable --now avahi-daemon || warn "avahi-daemon non avviato"
ok "mDNS configurato — accessibile come http://${HOSTNAME_MDNS}.local/"

# ── 2. Orologio NTP ───────────────────────────────────────────────────────────
step "2. Configurazione NTP (orologio)"
CHRONY_CONF=""
for f in /etc/chrony/chrony.conf /etc/chrony.conf; do
  if [[ -f "$f" ]]; then CHRONY_CONF="$f"; break; fi
done

if [[ -n "$CHRONY_CONF" ]]; then
  # makestep 1 -1 = correggi l'orario di scatto sempre, non solo ai primi 3 aggiornamenti
  if grep -qE '^\s*#?\s*makestep' "$CHRONY_CONF"; then
    sudo sed -i -E 's/^\s*#?\s*makestep.*/makestep 1 -1/' "$CHRONY_CONF"
  else
    printf 'makestep 1 -1\n' | sudo tee -a "$CHRONY_CONF" >/dev/null
  fi
  ok "Configurato $CHRONY_CONF"
else
  warn "chrony.conf non trovato — salto la configurazione"
fi

# Il servizio si chiama 'chrony' su Ubuntu, 'chronyd' altrove
CHRONY_SVC="chrony"
systemctl list-unit-files 2>/dev/null | grep -q '^chronyd\.service' && CHRONY_SVC="chronyd"
sudo systemctl enable --now "$CHRONY_SVC" || warn "Servizio $CHRONY_SVC non avviato"
sudo systemctl restart "$CHRONY_SVC" || true
sudo chronyc makestep >/dev/null 2>&1 || warn "chronyc makestep non riuscito (normale se chrony si sta avviando)"

# Script auto-correzione dopo resume della VM
sudo tee /usr/lib/systemd/system-sleep/99-fix-clock.sh >/dev/null << 'CLOCKSCRIPT'
#!/bin/bash
case "$1/$2" in
  post/*)
    sleep 2
    /usr/bin/chronyc makestep
    /usr/bin/logger "saltacode: orologio corretto dopo resume"
    ;;
esac
CLOCKSCRIPT
sudo chmod +x /usr/lib/systemd/system-sleep/99-fix-clock.sh
ok "NTP configurato + script post-resume installato"

# ── 3. Node.js ────────────────────────────────────────────────────────────────
step "3. Node.js $NODE_VERSION"
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
fi
if (( NODE_MAJOR < NODE_VERSION )); then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
ok "Node.js $(node -v) — npm $(npm -v)"

# npm rimasto da un'installazione precedente può restare più vecchio di quello
# richiesto dai progetti (vedi "engines" in package.json). npm ci è rigido sul
# formato del lockfile tra major diversi di npm e fallisce con EUSAGE se non
# corrisponde, anche a fronte di dipendenze corrette.
NPM_MIN="${NPM_MIN_VERSION:-10}"
NPM_MAJOR="$(npm -v | cut -d. -f1)"
if (( NPM_MAJOR < NPM_MIN )); then
  warn "npm $(npm -v) trovato, richiesto >= ${NPM_MIN} — aggiorno"
  sudo npm install -g "npm@${NPM_MIN}"
  hash -r
  ok "npm aggiornato a $(npm -v)"
fi

# ── 4. Utente di sistema ──────────────────────────────────────────────────────
step "4. Utente sistema '$SALTACODE_USER'"
if ! id "$SALTACODE_USER" &>/dev/null; then
  sudo useradd --system --create-home --shell /bin/bash "$SALTACODE_USER"
  ok "Utente creato"
else
  ok "Utente già esistente"
fi
SALTACODE_HOME="$(getent passwd "$SALTACODE_USER" | cut -d: -f6)"
[[ -n "$SALTACODE_HOME" ]] || err "Home di $SALTACODE_USER non determinabile"
sudo mkdir -p "$SALTACODE_HOME"
sudo chown "$SALTACODE_USER:$SALTACODE_USER" "$SALTACODE_HOME"

# ── 5. PM2 ────────────────────────────────────────────────────────────────────
step "5. PM2 (process manager)"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2 --no-fund --no-audit
fi
PM2_BIN="$(command -v pm2)"
# Eseguito da root, 'pm2 startup' installa da sé l'unit systemd: niente pipe in bash
sudo env PATH="$PATH" "$PM2_BIN" startup systemd \
  -u "$SALTACODE_USER" --hp "$SALTACODE_HOME" >/dev/null
ok "PM2 $( "$PM2_BIN" -v ) installato e abilitato al boot"

# ── 6. PostgreSQL ─────────────────────────────────────────────────────────────
step "6. Database PostgreSQL"
sudo systemctl enable --now postgresql

if [[ -z "$DB_PASS" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
  GENERATED_PASS=1
else
  GENERATED_PASS=0
fi

# ATTENZIONE: psql NON interpola le variabili (:'pw', :"dbuser") nelle stringhe
# passate con -c — quelle vengono spedite al server così come sono e danno
# errore di sintassi. L'interpolazione avviene solo con SQL da stdin o da -f.
psql_admin() {
  sudo -u postgres psql -qtAX -v ON_ERROR_STOP=1 \
    -v dbuser="$DB_USER" -v dbname="$DB_NAME" -v pw="$DB_PASS" "$@"
}

if [[ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")" == "1" ]]; then
  psql_admin << 'SQL' >/dev/null
ALTER ROLE :"dbuser" WITH LOGIN PASSWORD :'pw';
SQL
  ok "Ruolo '$DB_USER' aggiornato"
else
  psql_admin << 'SQL' >/dev/null
CREATE ROLE :"dbuser" WITH LOGIN PASSWORD :'pw';
SQL
  ok "Ruolo '$DB_USER' creato"
fi

if [[ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" != "1" ]]; then
  # CREATE DATABASE non può stare in un blocco transazionale: niente -1 / --single-transaction
  psql_admin << 'SQL' >/dev/null
CREATE DATABASE :"dbname" OWNER :"dbuser";
SQL
  ok "Database '$DB_NAME' creato"
fi

psql_admin << 'SQL' >/dev/null
GRANT ALL PRIVILEGES ON DATABASE :"dbname" TO :"dbuser";
SQL

# Da PostgreSQL 15 lo schema public non è più scrivibile di default
psql_admin -d "$DB_NAME" << 'SQL' >/dev/null
ALTER SCHEMA public OWNER TO :"dbuser";
GRANT ALL ON SCHEMA public TO :"dbuser";
SQL
ok "Database PostgreSQL configurato"

# ── 7. Struttura directory ────────────────────────────────────────────────────
step "7. Directory applicazione"
sudo mkdir -p "$APP_DIR/backend/src" "$APP_DIR/backend/prisma" "$APP_DIR/backend/assets" \
              "$APP_DIR/frontend/dist" "$LOG_DIR"
sudo chown -R "$SALTACODE_USER:$SALTACODE_USER" "$APP_DIR" "$LOG_DIR"
sudo chmod 755 "$APP_DIR"          # nginx deve poter attraversare la directory
ok "Directory create"

# ── 8. Copia sorgenti ─────────────────────────────────────────────────────────
step "8. Copia sorgenti dal repository"
# Copia come root (l'utente di sistema non ha accesso alla home dell'utente corrente),
# poi si sistemano i permessi. 'rsync --delete' evita residui di versioni precedenti.
sudo rsync -a --delete "$REPO_DIR/backend/src/"    "$APP_DIR/backend/src/"
sudo rsync -a --delete "$REPO_DIR/backend/prisma/" "$APP_DIR/backend/prisma/"
sudo cp -a "$REPO_DIR/backend/package.json"  "$APP_DIR/backend/"
sudo cp -a "$REPO_DIR/backend/tsconfig.json" "$APP_DIR/backend/"
if [[ -f "$REPO_DIR/backend/package-lock.json" ]]; then
  sudo cp -a "$REPO_DIR/backend/package-lock.json" "$APP_DIR/backend/"
fi
if [[ -d "$REPO_DIR/backend/assets" ]]; then
  sudo rsync -a "$REPO_DIR/backend/assets/" "$APP_DIR/backend/assets/"
fi

# File .env del backend: conserva il JWT_SECRET esistente, altrimenti tutte
# le sessioni attive verrebbero invalidate a ogni riesecuzione dello script.
JWT_SECRET=""
if sudo test -f "$APP_DIR/backend/.env"; then
  JWT_SECRET="$(sudo sed -n 's/^JWT_SECRET=//p' "$APP_DIR/backend/.env" | head -n1)"
fi
[[ -n "$JWT_SECRET" ]] || JWT_SECRET="$(openssl rand -hex 32)"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"

( umask 077
  cat > "$TMP_DIR/backend.env" << ENVEOF
NODE_ENV=production
PORT=3000
DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
BCRYPT_COST_FACTOR=12
CORS_ORIGIN=*
LOG_DIR=${LOG_DIR}
ENVEOF
)
# 0600: il file contiene password DB e secret JWT
sudo install -o "$SALTACODE_USER" -g "$SALTACODE_USER" -m 600 \
  "$TMP_DIR/backend.env" "$APP_DIR/backend/.env"

# Ecosystem PM2
cat > "$TMP_DIR/ecosystem.config.cjs" << ECOEOF
module.exports = {
  apps: [{
    name: 'saltacode-backend',
    cwd: '${APP_DIR}/backend',
    // tsx installato localmente: niente 'npx' a ogni restart (richiederebbe rete)
    script: 'node_modules/.bin/tsx',
    args: 'src/server.ts',
    interpreter: 'none',
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
sudo install -o "$SALTACODE_USER" -g "$SALTACODE_USER" -m 644 \
  "$TMP_DIR/ecosystem.config.cjs" "$APP_DIR/ecosystem.config.cjs"

sudo chown -R "$SALTACODE_USER:$SALTACODE_USER" "$APP_DIR/backend"
ok "Sorgenti copiati"

# ── 9. Dipendenze npm backend ─────────────────────────────────────────────────
step "9. Dipendenze npm backend"

# npm ci pretende un package-lock.json perfettamente allineato a package.json:
# se è disallineato esce con EUSAGE invece di risolvere da solo. In quel caso si
# ripiega su npm install, che ricalcola l'albero e riscrive il lock.
npm_as_saltacode() {
  sudo -H -u "$SALTACODE_USER" bash -c "cd '$APP_DIR/backend' && npm $*"
}

npm_backend_install() {
  local extra="$1"   # es. "--omit=dev" oppure ""
  if sudo -H -u "$SALTACODE_USER" test -f "$APP_DIR/backend/package-lock.json"; then
    if npm_as_saltacode "ci $extra --no-fund --no-audit"; then
      return 0
    fi
    warn "npm ci fallito: package-lock.json non allineato a package.json — ripiego su npm install"
    warn "Da sistemare nel repo: esegui 'npm install' in backend/ e committa il package-lock.json aggiornato"
  fi
  npm_as_saltacode "install $extra --no-fund --no-audit"
}

npm_backend_install "--omit=dev"

# tsx e prisma servono a runtime: se sono in devDependencies, --omit=dev li esclude
# e il backend non parte. In quel caso si reinstalla tutto.
if ! sudo -H -u "$SALTACODE_USER" test -x "$APP_DIR/backend/node_modules/.bin/tsx"; then
  warn "tsx assente con --omit=dev (è in devDependencies) — reinstallo tutte le dipendenze"
  warn "Consiglio: sposta 'tsx' e 'prisma' in dependencies, oppure compila con tsc e usa 'node dist/server.js'"
  npm_backend_install ""
fi
sudo -H -u "$SALTACODE_USER" test -x "$APP_DIR/backend/node_modules/.bin/tsx" \
  || err "tsx non installato: il backend non potrebbe avviarsi"
sudo -H -u "$SALTACODE_USER" test -x "$APP_DIR/backend/node_modules/.bin/prisma" \
  || warn "prisma CLI assente: 'prisma generate' e 'migrate deploy' falliranno"
ok "Dipendenze backend installate"

# ── 10. Schema database + seed ────────────────────────────────────────────────
step "10. Migrazione database"

prisma_as_saltacode() {
  sudo -H -u "$SALTACODE_USER" env DATABASE_URL="$DATABASE_URL" \
    bash -c "cd '$APP_DIR/backend' && npx --no-install prisma $*"
}

reset_saltacode_db() {
  step "10x. Reset database (dati precedenti verranno persi)"
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" >/dev/null
  sudo -u postgres psql -v dbname="$DB_NAME" -v dbuser="$DB_USER" << 'SQL' >/dev/null
CREATE DATABASE :"dbname" OWNER :"dbuser";
SQL
  sudo -u postgres psql -v dbname="$DB_NAME" -v dbuser="$DB_USER" -d "$DB_NAME" << 'SQL' >/dev/null
ALTER SCHEMA public OWNER TO :"dbuser";
GRANT ALL ON SCHEMA public TO :"dbuser";
SQL
  ok "Database '$DB_NAME' ricreato da zero"
}

prisma_as_saltacode generate

MIGRATE_LOG="$TMP_DIR/migrate-deploy.log"
if ! prisma_as_saltacode "migrate deploy" 2>&1 | tee "$MIGRATE_LOG"; then
  if grep -q 'P3018' "$MIGRATE_LOG"; then
    # P3018: una migrazione precedente è segnata come fallita nella tabella
    # _prisma_migrations — Prisma si blocca finché quello stato non viene
    # risolto. Su un'installazione nuova (nessun dato reale da perdere) la via
    # più semplice è droppare e ricreare il database, non "riparare" la
    # cronologia delle migrazioni.
    warn "Errore P3018: una migrazione precedente risulta fallita nel database"
    prisma_as_saltacode "migrate status" || true

    RESET_ANSWER="${RESET_DB_ON_FAILED_MIGRATION:-ask}"
    if [[ "$RESET_ANSWER" == "ask" ]]; then
      if [[ -r /dev/tty ]]; then
        printf '\n'
        warn "Ricreare da zero il database '$DB_NAME'? Ogni dato esistente andrà perso. [s/n]"
        read -r risposta < /dev/tty || risposta="n"
        [[ "$risposta" =~ ^[SsYy]$ ]] && RESET_ANSWER="yes" || RESET_ANSWER="no"
      else
        RESET_ANSWER="no"
        warn "Esecuzione non interattiva: reset saltato (rilancia con RESET_DB_ON_FAILED_MIGRATION=yes)"
      fi
    fi

    if [[ "$RESET_ANSWER" == "yes" ]]; then
      reset_saltacode_db
      prisma_as_saltacode "migrate deploy" \
        || err "migrate deploy fallito anche dopo il reset del database — controlla lo schema Prisma"
    else
      err "Migrazione bloccata (P3018). Risolvi manualmente con 'prisma migrate resolve' oppure rilancia con RESET_DB_ON_FAILED_MIGRATION=yes"
    fi
  else
    err "prisma migrate deploy fallito — vedi l'output sopra"
  fi
fi
ok "Schema database applicato"

if [[ "$SEED" == "ask" ]]; then
  if [[ -r /dev/tty ]]; then
    printf '\n'
    warn "Vuoi eseguire il seed (crea dati iniziali: superadmin, ruoli ecc.)? [s/n]"
    read -r risposta < /dev/tty || risposta="n"
    [[ "$risposta" =~ ^[SsYy]$ ]] && SEED="yes" || SEED="no"
  else
    SEED="no"
    warn "Esecuzione non interattiva: seed saltato (rilancia con SEED=yes per eseguirlo)"
  fi
fi

SEED_ESEGUITO=0
if [[ "$SEED" == "yes" ]]; then
  step "10b. Seed dati iniziali"
  sudo -H -u "$SALTACODE_USER" env DATABASE_URL="$DATABASE_URL" \
    bash -c "cd '$APP_DIR/backend' && npx --no-install tsx prisma/seed.ts"
  SEED_ESEGUITO=1
  ok "Seed completato"
fi

# ── 11. Build frontend ────────────────────────────────────────────────────────
step "11. Build frontend"
pushd "$REPO_DIR/frontend" >/dev/null
if [[ -f package-lock.json ]] && npm ci --no-fund --no-audit; then
  :
else
  [[ -f package-lock.json ]] && warn "npm ci fallito sul frontend (lock disallineato) — uso npm install"
  npm install --no-fund --no-audit
fi
npm run build          # output non filtrato: in caso di errore serve vederlo
[[ -d dist ]] || err "La build non ha prodotto la cartella dist/"

sudo rsync -a --delete dist/ "$APP_DIR/frontend/dist/"
for extra in public/DingLing.wav public/logo.svg; do
  [[ -f "$extra" ]] && sudo cp -a "$extra" "$APP_DIR/frontend/dist/"
done
popd >/dev/null

sudo chown -R "$SALTACODE_USER:$SALTACODE_USER" "$APP_DIR/frontend"
sudo chmod -R a+rX "$APP_DIR/frontend"        # nginx (www-data) deve poter leggere
ok "Frontend buildato e copiato"

# ── 12. Nginx ─────────────────────────────────────────────────────────────────
step "12. Configurazione Nginx"
# Heredoc non quotato: $APP_DIR viene sostituito, le variabili di nginx sono con \$
cat > "$TMP_DIR/saltacode-nginx.conf" << NGINXEOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    client_max_body_size 25m;

    root ${APP_DIR}/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /health {
        proxy_pass http://127.0.0.1:3000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
NGINXEOF
sudo install -m 644 "$TMP_DIR/saltacode-nginx.conf" /etc/nginx/sites-available/saltacode
sudo ln -sf /etc/nginx/sites-available/saltacode /etc/nginx/sites-enabled/saltacode
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx          # 'reload' fallisce se nginx non è già in esecuzione
ok "Nginx configurato"

# Firewall, solo se ufw è attivo
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q '^Status: active'; then
  sudo ufw allow 80/tcp   >/dev/null || true
  sudo ufw allow 5353/udp >/dev/null || true   # mDNS
  ok "Regole ufw aggiunte (80/tcp, 5353/udp)"
fi

# ── 13. Avvio backend ─────────────────────────────────────────────────────────
step "13. Avvio backend con PM2"
# -H: HOME punta alla home di saltacode, altrimenti PM2 scrive lo stato nella home sbagliata.
# startOrReload: avvia se fermo, ricarica se già attivo (script rieseguibile).
sudo -H -u "$SALTACODE_USER" pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env
sudo -H -u "$SALTACODE_USER" pm2 save
ok "Backend avviato"

# ── 14. Verifica finale ───────────────────────────────────────────────────────
step "14. Verifica installazione"
HTTP="000"
for _ in {1..15}; do
  HTTP="$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/health || true)"
  [[ "$HTTP" == "200" ]] && break
  sleep 2
done
if [[ "$HTTP" == "200" ]]; then
  ok "API risponde correttamente (HTTP $HTTP)"
else
  warn "API risponde HTTP $HTTP — controlla i log: sudo -H -u $SALTACODE_USER pm2 logs saltacode-backend"
fi

IP="$(hostname -I | awk '{print $1}')"
printf '\n'
printf '%b+------------------------------------------------------+%b\n' "$GREEN" "$NC"
printf '%b|            INSTALLAZIONE COMPLETATA                   |%b\n' "$GREEN" "$NC"
printf '%b+------------------------------------------------------+%b\n' "$GREEN" "$NC"
printf '\n'
printf '  Accesso per IP:    %b http://%s/%b\n'            "$GREEN" "$IP" "$NC"
printf '  Accesso per nome:  %b http://%s.local/%b  (qualsiasi rete)\n' "$GREEN" "$HOSTNAME_MDNS" "$NC"
printf '  Monitor:           %b http://%s.local/monitor%b\n' "$GREEN" "$HOSTNAME_MDNS" "$NC"
printf '\n'
if (( SEED_ESEGUITO )); then
  printf '  Credenziali iniziali superadmin:\n'
  printf '  Username: %bsuperadmin%b\n'        "$GREEN" "$NC"
  printf '  Password: %bAdmin@Saltacode1%b  (cambiarla al primo accesso)\n' "$GREEN" "$NC"
else
  printf '  Seed non eseguito: nessun utente iniziale creato.\n'
  printf '  Per eseguirlo: %bSEED=yes bash %s%b\n' "$YELLOW" "${BASH_SOURCE[0]}" "$NC"
fi
printf '\n'
if (( GENERATED_PASS )); then
  printf '  Password DB generata automaticamente e salvata in %s/backend/.env (0600)\n' "$APP_DIR"
  printf '\n'
fi
printf '  Comandi utili:\n'
printf '  %bsudo -H -u %s pm2 status%b               # stato backend\n'  "$YELLOW" "$SALTACODE_USER" "$NC"
printf '  %bsudo -H -u %s pm2 logs%b                 # log in tempo reale\n' "$YELLOW" "$SALTACODE_USER" "$NC"
printf '  %bsudo -H -u %s pm2 restart saltacode-backend%b\n' "$YELLOW" "$SALTACODE_USER" "$NC"
printf '  %bsudo nginx -t && sudo systemctl reload nginx%b  # ricarica nginx\n' "$YELLOW" "$NC"
printf '\n'