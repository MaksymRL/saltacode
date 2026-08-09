# Saltacode — Queue Manager CISL

Sistema web moderno per la gestione delle code di accesso ai servizi CISL (CAF, INAS/Patronato).

## Stack

- **Backend**: Node.js 20 + Express 4 + TypeScript + Prisma ORM
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: PostgreSQL 15
- **Real-time**: WebSocket nativo (`ws`)
- **Deployment**: Ubuntu 22.04 LTS + Nginx + systemd

## Prerequisiti (sviluppo locale)

- Node.js v20+
- PostgreSQL 15

## Avvio in sviluppo

### 1. Configura il backend

```bash
cd backend
cp .env.example .env
# Modifica DATABASE_URL con le tue credenziali PostgreSQL
```

### 2. Installa le dipendenze e prepara il DB

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Avvia il backend (terminale 1)

```bash
cd backend
npm run dev
# → http://localhost:3000
# → http://localhost:3000/health
```

### 4. Avvia il frontend (terminale 2)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Struttura progetto

```
saltacode/
├── backend/
│   ├── prisma/schema.prisma     ← Schema DB
│   └── src/
│       ├── config/              ← Variabili d'ambiente
│       ├── middleware/          ← Auth JWT, rate limiter, error handler
│       ├── routes/              ← Endpoints API REST
│       ├── services/            ← Logica di business
│       ├── websocket/           ← Server WebSocket
│       └── utils/               ← Logger
├── frontend/
│   └── src/
│       ├── api/                 ← Axios client con JWT
│       ├── context/             ← AuthContext
│       ├── hooks/               ← useWebSocket, useAuth
│       └── pages/               ← SuperAdmin, Admin, Accoglienza, Operatore, Monitor
└── deploy/
    ├── install.sh               ← Script installazione Ubuntu
    ├── nginx.conf               ← Config Nginx HTTPS
    └── saltacode.service        ← Systemd unit
```

## API Endpoints

| Metodo | Endpoint | Ruolo | Descrizione |
|--------|----------|-------|-------------|
| POST | `/api/auth/login` | Tutti | Login |
| POST | `/api/auth/logout` | Autenticati | Logout |
| GET | `/api/aree` | SuperAdmin | Lista aree |
| POST | `/api/aree` | SuperAdmin | Crea area |
| PATCH | `/api/aree/:id` | SuperAdmin | Modifica area |
| GET | `/api/utenti` | SuperAdmin, Admin | Lista utenti |
| POST | `/api/utenti` | SuperAdmin, Admin | Crea utente |
| PATCH | `/api/utenti/:id` | SuperAdmin, Admin | Modifica utente |
| GET | `/api/servizi` | Admin, Accoglienza, Operatore | Lista servizi |
| POST | `/api/servizi` | Admin | Crea servizio |
| PATCH | `/api/servizi/:id` | Admin | Modifica servizio |
| POST | `/api/ticket` | Accoglienza | Emette ticket |
| POST | `/api/chiamate` | Operatore | Chiama prossimo |
| DELETE | `/api/chiamate/:id` | Operatore | Annulla chiamata |
| GET | `/api/monitor/stato` | Pubblico | Ultimi 10 chiamati |
| GET | `/health` | Pubblico | Health check |

## Deploy su Ubuntu 22.04

```bash
sudo bash deploy/install.sh
```

Lo script configura automaticamente: Node.js, PostgreSQL, Nginx, SSL, systemd.

## Pagine

| URL | Ruolo | Descrizione |
|-----|-------|-------------|
| `/login` | Tutti | Pagina di accesso |
| `/superadmin` | SuperAdmin | Gestione aree e utenti |
| `/admin` | Admin | Gestione operatori e servizi |
| `/accoglienza` | Accoglienza | Emissione ticket |
| `/operatore` | Operatore | Chiama prossimo |
| `/monitor` | Pubblico | Display sala d'attesa (TV) |
