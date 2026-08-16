# 🎯 Saltacode Queue Manager

Sistema moderno per la gestione delle code di accesso ai servizi CISL. Sostituisce il precedente sistema Java Servlet con un'applicazione web contemporanea basata su Node.js/TypeScript + React, comunicazione real-time WebSocket e database PostgreSQL.

## ✨ Caratteristiche Principali

- 🔐 **Multi-ruolo avanzato**: Un utente può avere più ruoli e scegliere con quale entrare
- ⚡ **Real-time**: Aggiornamenti istantanei via WebSocket (<500ms)
- 🎫 **Gestione ticket**: Emissione automatica con numerazione progressiva giornaliera
- 📱 **Monitor pubblico**: Display per sala d'attesa con annunci TTS
- 🏥 **Health monitoring**: Endpoint completi per monitoraggio sistema
- 💾 **Backup automatico**: Backup giornaliero PostgreSQL con rotazione
- 🔒 **Sicurezza enterprise**: JWT, bcrypt, rate limiting, CSRF protection

## 🏗️ Architettura

```
Frontend (React 18 + TypeScript)  ←→  Nginx (HTTPS + WebSocket)  ←→  Backend (Node.js + Express)  ←→  PostgreSQL 15
```

## 🚀 Quick Start

### Produzione (VM Ubuntu)

```bash
# 1. Clona il repository
git clone <repository-url> saltacode
cd saltacode

# 2. Esegui lo script di installazione automatica
sudo bash deploy/setup.sh

# 3. Verifica che tutto funzioni
sudo bash deploy/test-system.sh
```

Il sistema sarà disponibile su `http://[IP-VM]/` con credenziali iniziali:
- **Username**: `superadmin`
- **Password**: `Admin@Saltacode1`

### Sviluppo (Locale)

```bash
# Backend
cd backend
npm install
cp .env.example .env  # configura le variabili
npm run db:migrate
npm run db:seed
npm run dev

# Frontend (terminale separato)
cd frontend
npm install
npm run dev
```

## 📊 Monitoraggio e Manutenzione

### Comandi Utili

```bash
# Stato dei processi
sudo -u saltacode pm2 status
sudo -u saltacode pm2 logs saltacode-backend

# Restart dell'applicazione
sudo -u saltacode pm2 restart saltacode-backend

# Stato servizi sistema
systemctl status nginx postgresql

# Health check manuale
curl http://localhost/health
```

### Backup

```bash
# Backup manuale
sudo -u saltacode node /opt/saltacode/backend/dist/scripts/daily-backup.js

# Verifica backup automatici
ls -la /var/backups/saltacode/
```

### Test del Sistema

```bash
# Test completo del sistema
sudo bash /opt/saltacode/deploy/test-system.sh

# Test delle proprietà (Property-Based Tests)
cd /opt/saltacode/backend && npm test
```

## 🔧 Aggiornamento del Codice

```bash
# 1. Ferma l'applicazione
sudo -u saltacode pm2 stop saltacode-backend

# 2. Aggiorna il codice (git pull o copia files)
cd /opt/saltacode
git pull origin main

# 3. Applica migrazioni se necessario
cd backend && npx prisma migrate deploy

# 4. Aggiorna dipendenze
npm ci --omit=dev

# 5. Rebuild frontend
cd ../frontend && npm ci && npm run build

# 6. Riavvia
sudo -u saltacode pm2 restart saltacode-backend
```

## 📋 Utenti e Ruoli

### Tipi di Utente

| Ruolo | Funzioni |
|---|---|
| **SuperAdmin** | Gestisce aree, Admin, Accoglienza |
| **Admin** | Gestisce operatori e servizi della sua area |
| **Accoglienza** | Emette ticket per i clienti |
| **Operatore** | Chiama i numeri dalla sua postazione |

### Multi-ruolo

Gli utenti possono avere più ruoli contemporaneamente:
1. Login con username/password
2. Selezione del ruolo (se > 1 disponibile)
3. Accesso alla dashboard del ruolo scelto

## 🔌 API Endpoints

### Principali

- `GET /health` - Health check con stato database
- `POST /api/auth/login` - Autenticazione fase 1
- `POST /api/auth/select-role` - Selezione ruolo fase 2
- `GET /api/aree` - Lista aree (SuperAdmin)
- `POST /api/ticket` - Emissione ticket (Accoglienza)
- `POST /api/chiamate` - Chiamata prossimo (Operatore)
- `GET /api/monitor/stato` - Stato monitor pubblico

### WebSocket Events

- `TICKET_EMESSO` - Nuovo ticket in coda
- `NUMERO_CHIAMATO` - Numero chiamato da operatore
- `STATO_POSTAZIONE` - Cambio stato operatore

## ⚙️ Configurazione

### Variabili d'Ambiente (.env)

```env
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://saltacode:password@localhost:5432/saltacode_db"
JWT_SECRET="your-super-secret-jwt-key-minimum-64-chars"
BCRYPT_COST_FACTOR=12
CORS_ORIGIN=*
LOG_DIR=/var/log/saltacode
```

### Personalizzazioni

- **Logo CISL**: Sostituisci `frontend/src/assets/logo.png`
- **Colori**: Modifica `frontend/src/styles/theme.css`
- **Servizi**: Configurabili via dashboard Admin
- **Aree**: Configurabili via dashboard SuperAdmin

## 🧪 Testing

Il sistema include Property-Based Testing con 100+ iterazioni per le funzioni critiche:

- Validazione password policy
- Generazione username univoci
- Formato numeri ticket 
- Logica FIFO delle code
- Ordinamento cronologico monitor
- Round-trip JSON serialization

```bash
cd backend && npm test
```

## 📁 Struttura Progetto

```
saltacode/
├── backend/                 # Server Node.js/Express/TypeScript
│   ├── src/
│   │   ├── routes/         # Endpoint API REST
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, error handling, rate limiting
│   │   ├── websocket/      # WebSocket real-time server
│   │   └── test/          # Property-based tests
│   ├── prisma/            # Schema database e migrations
│   └── dist/              # Codice compilato TypeScript
│
├── frontend/               # App React/TypeScript
│   ├── src/
│   │   ├── pages/         # Dashboard per ruolo
│   │   ├── context/       # Stato globale (Auth)
│   │   └── hooks/         # useAuth, useWebSocket
│   └── dist/              # Build produzione (Vite)
│
└── deploy/                 # Script deployment Ubuntu
    ├── setup.sh           # Installazione automatica
    ├── test-system.sh     # Verifica sistema completo
    └── nginx.conf         # Configurazione reverse proxy
```

## 🛡️ Sicurezza

- **HTTPS**: TLS 1.2+ obbligatorio in produzione
- **JWT**: Token con scadenza 60min + auto-refresh
- **Bcrypt**: Hash password con cost factor ≥12
- **Rate Limiting**: 5 tentativi login / 10min
- **CSRF**: Protezione su tutte le modifiche di stato
- **Headers**: Security headers via Helmet
- **Validazione**: Sanitizzazione di tutti gli input

## 📞 Supporto

### Log Files

- **Applicazione**: `/var/log/saltacode/app.log`
- **PM2**: `/var/log/saltacode/pm2-*.log`
- **Backup**: `/var/log/saltacode/backup.log`
- **Nginx**: `/var/log/nginx/access.log`

### Risoluzione Problemi

1. **App non si avvia**: Controlla `pm2 logs saltacode-backend`
2. **Database errore**: Verifica `systemctl status postgresql`
3. **502 Bad Gateway**: Backend non risponde, riavvia PM2
4. **WebSocket disconnesso**: Controlla configurazione Nginx proxy

---

## 📄 Licenza

Questo progetto è sviluppato per CISL. Tutti i diritti riservati.

---

**🚀 Saltacode v1.0 - Sistema di gestione code moderno per CISL**
