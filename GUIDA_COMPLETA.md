# Saltacode — Guida Completa al Progetto

> Questa guida spiega **tutto**: cos'è il progetto, perché è stato costruito così,
> come funziona ogni pezzo di codice, e come farlo girare sulla VM Ubuntu.
> Scritta per chi parte da zero ma vuole capire davvero, non solo copiare comandi.

---

## Indice

1. [Cos'è Saltacode e cosa fa](#1-cosè-saltacode-e-cosa-fa)
2. [La struttura del progetto](#2-la-struttura-del-progetto)
3. [Le tecnologie scelte e perché](#3-le-tecnologie-scelte-e-perché)
4. [Il Database — PostgreSQL e Prisma](#4-il-database--postgresql-e-prisma)
5. [Il Backend — Node.js / Express](#5-il-backend--nodejs--express)
6. [I WebSocket — aggiornamento in tempo reale](#6-i-websocket--aggiornamento-in-tempo-reale)
7. [Il Frontend — React / Vite](#7-il-frontend--react--vite)
8. [Il flusso completo di una richiesta](#8-il-flusso-completo-di-una-richiesta)
9. [Autenticazione JWT — come funziona](#9-autenticazione-jwt--come-funziona)
10. [I ruoli utente e i permessi](#10-i-ruoli-utente-e-i-permessi)
11. [Come funziona l'emissione di un ticket](#11-come-funziona-lemissione-di-un-ticket)
12. [Come funziona la chiamata di un numero](#12-come-funziona-la-chiamata-di-un-numero)
13. [Il Deploy sulla VM Ubuntu](#13-il-deploy-sulla-vm-ubuntu)
14. [Nginx — il reverse proxy](#14-nginx--il-reverse-proxy)
15. [PM2 — il gestore dei processi](#15-pm2--il-gestore-dei-processi)
16. [Il file .env — configurazione dell'ambiente](#16-il-file-env--configurazione-dellambiente)
17. [Cosa succede al boot della VM](#17-cosa-succede-al-boot-della-vm)
18. [Come aggiornare il codice in produzione](#18-come-aggiornare-il-codice-in-produzione)
19. [Problemi comuni e come risolverli](#19-problemi-comuni-e-come-risolverli)
20. [Glossario dei termini tecnici](#20-glossario-dei-termini-tecnici)

---

## 1. Cos'è Saltacode e cosa fa

Saltacode è un **sistema di gestione delle code** per uno sportello fisico (come un CAF CISL).
Funziona così nella realtà:

```
Cliente entra → va allo sportello Accoglienza → prende il ticket stampato
    → si siede e aspetta → l'Operatore chiama il suo numero
    → il Monitor in sala mostra il numero chiamato + legge ad alta voce
```

Il sistema è composto da **5 tipi di utenti**:

| Utente | Cosa può fare |
|---|---|
| **SuperAdmin** | Crea aree (es. "CAF CISL"), crea Admin e utenti Accoglienza |
| **Admin** | Gestisce i servizi (es. "730", "ISEE") e gli Operatori della sua area |
| **Accoglienza** | Emette i ticket (li stampa per il cliente) |
| **Operatore** | Chiama il prossimo numero dalla sua postazione |
| **Monitor** | Display TV in sala che mostra i numeri chiamati (nessun login) |

---

## 2. La struttura del progetto

```
saltacode/
├── backend/                ← Server Node.js che gestisce tutto
│   ├── src/
│   │   ├── server.ts       ← Punto di ingresso: avvia tutto
│   │   ├── app.ts          ← Configura Express (middlewares, route)
│   │   ├── config/
│   │   │   └── index.ts    ← Legge le variabili d'ambiente (.env)
│   │   ├── routes/         ← Ogni file = un gruppo di URL
│   │   │   ├── auth.ts     ← /api/auth/login, /logout
│   │   │   ├── aree.ts     ← /api/aree
│   │   │   ├── utenti.ts   ← /api/utenti
│   │   │   ├── servizi.ts  ← /api/servizi
│   │   │   ├── ticket.ts   ← /api/ticket
│   │   │   ├── chiamate.ts ← /api/chiamate
│   │   │   └── monitor.ts  ← /api/monitor
│   │   ├── services/       ← Logica di business (dove avviene il "lavoro")
│   │   │   ├── authService.ts    ← Login, hash password, genera username
│   │   │   ├── ticketService.ts  ← Emette ticket con numero progressivo
│   │   │   ├── queueService.ts   ← Chiama il prossimo, annulla
│   │   │   ├── pdfService.ts     ← Genera PDF A5 del ticket
│   │   │   └── wsService.ts      ← Gestisce le "stanze" WebSocket
│   │   ├── middleware/     ← Codice che si esegue PRIMA delle route
│   │   │   ├── auth.ts         ← Verifica il token JWT
│   │   │   ├── errorHandler.ts ← Gestisce gli errori in modo uniforme
│   │   │   └── rateLimiter.ts  ← Blocca troppi tentativi di login
│   │   ├── websocket/
│   │   │   └── wsServer.ts ← Server WebSocket (connessioni real-time)
│   │   ├── prisma/
│   │   │   └── client.ts   ← Istanza singleton di Prisma (connessione DB)
│   │   └── utils/
│   │       └── logger.ts   ← Sistema di log (file + console)
│   ├── prisma/
│   │   ├── schema.prisma   ← Definisce le tabelle del database
│   │   └── seed.ts         ← Popola il DB con dati iniziali
│   ├── .env                ← Variabili d'ambiente (NON va in git)
│   ├── package.json        ← Dipendenze e script npm
│   └── tsconfig.json       ← Configurazione TypeScript
│
├── frontend/               ← Applicazione React (interfaccia utente)
│   ├── src/
│   │   ├── main.tsx        ← Punto di ingresso React
│   │   ├── App.tsx         ← Router principale (chi vede cosa)
│   │   ├── context/
│   │   │   └── AuthContext.tsx  ← Stato globale utente loggato
│   │   ├── hooks/
│   │   │   ├── useAuth.ts       ← Accesso all'utente loggato
│   │   │   └── useWebSocket.ts  ← Connessione WebSocket con reconnect
│   │   ├── api/
│   │   │   └── client.ts        ← Client HTTP (axios) con JWT automatico
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── SelectRole.tsx      ← Selezione ruolo dopo il login
│   │       ├── ChangePassword.tsx
│   │       ├── SuperAdmin/Dashboard.tsx
│   │       ├── Admin/Dashboard.tsx
│   │       ├── Accoglienza/Dashboard.tsx
│   │       ├── Operatore/Dashboard.tsx
│   │       └── Monitor/Display.tsx
│   ├── index.html
│   ├── vite.config.ts      ← Configurazione Vite (proxy dev, build)
│   └── package.json
│
└── deploy/
    ├── setup.sh            ← Script installazione su Ubuntu
    └── update.sh           ← Script aggiornamento
```

---

## 3. Le tecnologie scelte e perché

### Backend: Node.js + TypeScript

**Node.js** è un runtime JavaScript che gira sul server (non nel browser).
È stato scelto perché:
- È ottimo per applicazioni con molte connessioni simultanee (come i WebSocket)
- Ha un ecosistema enorme (npm)
- Il team usa già JavaScript/TypeScript nel frontend → stesso linguaggio ovunque

**TypeScript** aggiunge i "tipi" a JavaScript. Significa che se scrivi:
```typescript
function somma(a: number, b: number): number {
    return a + b;
}
somma("ciao", 5); // ← ERRORE: TypeScript se ne accorge PRIMA che giri
```
Questo previene molti bug prima che arrivino in produzione.

### Framework web: Express.js

Express è il framework più diffuso per Node.js. Ti permette di definire URL e cosa fare quando qualcuno li chiama:
```typescript
app.get('/api/aree', (req, res) => {
    // quando qualcuno fa GET /api/aree
    res.json([{ id: 1, nome: "CAF CISL" }]);
});
```
È stato scelto perché è semplice, maturo, e ha tantissima documentazione.

### Database: PostgreSQL

PostgreSQL è un database relazionale potente e gratuito. È stato scelto rispetto ad altri perché:
- È **ACID compliant** — garantisce che le transazioni siano atomiche (importante per i contatori dei ticket: non possono mai uscire due ticket con lo stesso numero)
- Supporta tipi avanzati
- È lo standard de-facto per applicazioni professionali

### ORM: Prisma

Prisma è uno strumento che ti permette di parlare con il database usando TypeScript invece di SQL grezzo:
```typescript
// Con Prisma (TypeScript):
const utente = await prisma.utente.findUnique({
    where: { username: "mario" }
});

// Equivalente SQL:
// SELECT * FROM utenti WHERE username = 'mario' LIMIT 1;
```
Vantaggi:
- Il codice è type-safe (TypeScript sa che `utente.username` è una stringa)
- Le **migrazioni** (cambiamenti alla struttura del DB) sono gestite automaticamente
- Evita SQL injection per definizione

### Frontend: React + Vite

**React** è la libreria JavaScript più popolare per costruire interfacce utente. Il concetto chiave è che l'interfaccia è divisa in **componenti** riutilizzabili:
```tsx
// Un componente React = una funzione che ritorna HTML
function Bottone({ testo, onClick }) {
    return <button onClick={onClick}>{testo}</button>;
}
```

**Vite** è il tool di sviluppo/build. In sviluppo avvia un server velocissimo con hot reload (le modifiche al codice appaiono nel browser istantaneamente senza ricaricare). Per la produzione compila tutto in file statici ottimizzati.

### WebSocket

I WebSocket sono connessioni **persistenti bidirezionali** tra browser e server. Normalmente HTTP funziona così:
```
Browser → "dammi i dati" → Server → risponde → connessione chiusa
```
Con WebSocket:
```
Browser ←→ Server  (connessione aperta per sempre, entrambi possono mandare messaggi)
```
Nel progetto serve perché quando l'Operatore chiama un numero, il Monitor deve aggiornare lo schermo **immediatamente** senza che il browser faccia continuamente richieste.

---

## 4. Il Database — PostgreSQL e Prisma

### Le tabelle (schema.prisma)

Il file `prisma/schema.prisma` descrive la struttura del database. Ogni `model` diventa una tabella.

```
Area ──────────────────────────────────────────────
│  id, nome, prefisso (es "CA"), attiva
│
├── ha molti → Servizio
│              │  id, nome, lettera, attivo, areaId
│              │
│              ├── ha molti → Ticket
│              │              │  id, numero (es "CAA001"), stato, emessoPer
│              │              │  stato: ATTESA → CHIAMATO → SERVITO
│              │
│              ├── ha molti → ContatoreGiornaliero
│              │              │  data, ultimoNumero
│              │              │  (usato per generare il numero progressivo)
│              │
│              └── ha molti → Chiamata
│                             │  utenteId, servizioId, ticketId, postazione
│
├── ha molti → Utente (via UtenteArea)
│
Utente ─────────────────────────────────────────────
│  id, username, cognome, nome, passwordHash, stato
│
├── ha molti ruoli → UtenteRuolo ──→ Ruolo
│   Un utente può avere più ruoli: ADMIN + OPERATORE, ecc.
│   Dopo il login sceglie con quale ruolo entrare.
│
└── ha molti aree → UtenteArea ──→ Area

Ruolo ──────────────────────────────────────────────
│  id, nome (SUPERADMIN, ADMIN, ACCOGLIENZA, OPERATORE)
└── molti utenti → UtenteRuolo
```

### Come funzionano le migrazioni

Quando modifichi `schema.prisma` ed esegui:
```bash
npx prisma migrate dev --name "aggiunto_campo_telefono"
```
Prisma:
1. Confronta il nuovo schema con quello attuale
2. Genera un file SQL con le modifiche
3. Lo esegue sul database
4. Salva la cronologia delle migrazioni in `prisma/migrations/`

Così puoi sempre sapere esattamente come è cambiato il database nel tempo.

### Il seed (dati iniziali)

`prisma/seed.ts` viene eseguito una volta sola per popolare il DB con:
- 4 ruoli (SUPERADMIN, ADMIN, ACCOGLIENZA, OPERATORE)
- 1 area di esempio (CAF CISL, prefisso "CA")
- 2 servizi (730, ISEE)
- 1 utente SuperAdmin con password temporanea
- 1 utente Admin di esempio

---

## 5. Il Backend — Node.js / Express

### Il punto di partenza: server.ts

```typescript
// server.ts — tutto inizia qui
async function main() {
    await prisma.$connect();          // 1. Connettiti al database
    consnmress
    const server = http.createServer(app); // 3. Crea il server HTTP
    attachWebSocketServer(server);    // 4. Aggiungi WebSocket
    server.listen(3000);              // 5. Inizia ad ascoltare
}
```

### Come funziona Express (app.ts)

Express funziona con una catena di **middleware** — funzioni che si eseguono in sequenza per ogni richiesta:

```
Richiesta HTTP
    ↓
helmet()          ← aggiunge header di sicurezza
    ↓
cors()            ← permette al browser di fare richieste (policy CORS)
    ↓
compression()     ← comprime le risposte (gzip)
    ↓
express.json()    ← converte il body JSON in oggetto JavaScript
    ↓
requestLogger     ← logga ogni richiesta con durata e status
    ↓
/api/auth         ← route specifica
/api/aree         ←
/api/utenti       ←
...
    ↓
errorHandler      ← gestisce tutti gli errori non catturati
```

### Le route

Ogni file in `routes/` gestisce un gruppo di URL. Esempio per `aree.ts`:

```typescript
// Tutti devono essere autenticati
router.use(authenticate);

// GET /api/aree — solo SuperAdmin
router.get('/', authorize('SUPERADMIN'), async (req, res) => {
    const aree = await prisma.area.findMany();
    res.json(aree);
});

// POST /api/aree — solo SuperAdmin
router.post('/', authorize('SUPERADMIN'), async (req, res) => {
    const area = await prisma.area.create({ data: req.body });
    res.status(201).json(area);
});
```

### I Service — dove vive la logica di business

Le route fanno solo validazione e risposta HTTP. La logica vera sta nei **service**:

```
Route (aree.ts)  →  chiama  →  Service (es. ticketService.ts)
                                    ↓
                               Prisma (DB)
```

Questo separa le responsabilità: se cambio il DB, cambio solo il service, non le route.

---

## 6. I WebSocket — aggiornamento in tempo reale

### Il problema che risolvono

Senza WebSocket, per vedere i numeri aggiornati dovresti ricaricare la pagina ogni secondo.
Con WebSocket il server **spinge** i dati al browser non appena cambiano.

### Come funziona nel progetto

Il file `wsServer.ts` attacca un server WebSocket allo stesso server HTTP (stessa porta 3000, percorso `/ws`).

**Quando un browser si connette:**
1. Manda il token JWT nell'URL: `/ws?token=eyJ...`
2. Il server verifica il token
3. Iscrive il client nella "room" della sua area
4. Manda lo stato iniziale (ultimi chiamati, code attuali)

**Le "room" (wsService.ts):**
```
rooms = {
    1: [ws_accoglienza1, ws_operatore1, ws_admin1],  // area id=1
    2: [ws_accoglienza2],                             // area id=2
}
monitorClients = [ws_monitor_tv]  // monitor globale
```

**Quando viene emesso un ticket:**
```typescript
// ticketService.ts
broadcast(servizio.areaId, { type: 'TICKET_EMESSO', servizioId, coda: 5 });
broadcastMonitor({ type: 'TICKET_EMESSO', ... });
```
Tutti i browser connessi a quell'area ricevono il messaggio istantaneamente.

**Il heartbeat (ping/pong):**
Ogni 30 secondi il server manda un ping. Se il browser non risponde entro 10 secondi, la connessione si chiude automaticamente (evita connessioni zombie).

**Il reconnect automatico (frontend):**
```typescript
// useWebSocket.ts
ws.onclose = () => {
    // Riconnetti con backoff esponenziale: 1s, 2s, 4s, 8s... max 30s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    setTimeout(() => connect(), delay);
};
```

---

## 7. Il Frontend — React / Vite

### Come React gestisce l'interfaccia

React mantiene un **Virtual DOM** — una rappresentazione in memoria dell'interfaccia. Quando i dati cambiano, React calcola le differenze e aggiorna solo le parti necessarie del DOM reale. Questo lo rende molto efficiente.

### Lo stato globale — AuthContext

`AuthContext.tsx` è il "cervello" dell'autenticazione nel frontend.
Usa il **Context API** di React — un modo per condividere dati tra tutti i componenti senza passarli manualmente:

```typescript
// Dopo il login, salva utente e token ovunque accessibili
const { user, login, logout, isAuthenticated } = useAuth();
```

Il token JWT viene salvato in `localStorage` così sopravvive al refresh della pagina.

### Il client HTTP — api/client.ts

```typescript
const apiClient = axios.create({ baseURL: '/api' });

// INTERCETTORE REQUEST: aggiunge JWT ad ogni chiamata
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('saltacode_token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
});

// INTERCETTORE RESPONSE: se 401 → torna al login
apiClient.interceptors.response.use(
    (response) => {
        // Se il server ha rinnovato il token, salvalo
        const renewedToken = response.headers['x-renewed-token'];
        if (renewedToken) localStorage.setItem('saltacode_token', renewedToken);
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            localStorage.clear();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
```

### Il routing — App.tsx

React Router gestisce la navigazione senza ricaricare la pagina:
```typescript
<Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/superadmin" element={
        <PrivateRoute ruoli={['SUPERADMIN']}>
            <SuperAdminDashboard />
        </PrivateRoute>
    } />
    // ...
</Routes>
```

`PrivateRoute` verifica che l'utente sia loggato e abbia il ruolo giusto prima di mostrare la pagina.

### In produzione — Vite build

```bash
npm run build
```
Vite compila tutto il codice React/TypeScript in file HTML/CSS/JS ottimizzati nella cartella `dist/`. Questi file **non hanno bisogno di Node.js** per essere serviti — li serve Nginx direttamente come file statici.

---

## 8. Il flusso completo di una richiesta

Vediamo cosa succede quando l'Accoglienza preme "Stampa Ticket":

```
[Browser Accoglienza]
    │  1. Click "Stampa Ticket" per servizio id=1
    │
    │  POST /api/ticket
    │  Headers: { Authorization: "Bearer eyJ..." }
    │  Body: { servizioId: 1 }
    ▼
[Nginx]
    │  2. Riceve la richiesta sulla porta 80
    │  3. La forwarda al backend sulla porta 3000
    ▼
[Express - app.ts]
    │  4. Passa per helmet, cors, compression, json parser
    │  5. Arriva alla route /api/ticket
    ▼
[Middleware authenticate - auth.ts]
    │  6. Legge il token JWT dall'header Authorization
    │  7. Verifica la firma con JWT_SECRET
    │  8. Decodifica: { sub: 42, username: "mrossi", ruolo: "ACCOGLIENZA", aree: [1] }
    │  9. Attacca req.user = payload
    ▼
[Middleware authorize("ACCOGLIENZA")]
    │  10. Verifica che req.user.ruolo === "ACCOGLIENZA" ✓
    ▼
[Route POST /api/ticket - ticket.ts]
    │  11. Legge servizioId dal body
    │  12. Chiama ticketService.emitTicket(1, 42)
    ▼
[ticketService.emitTicket]
    │  13. Apre una TRANSAZIONE sul database
    │  14. Legge il servizio (verifica che esista e sia attivo)
    │  15. Legge il ContatoreGiornaliero per oggi
    │      es. ultimoNumero = 7
    │  16. Incrementa: ultimoNumero = 8
    │  17. Aggiorna il contatore nel DB
    │  18. Genera il numero: prefisso(CA) + lettera(A) + 008 = "CAA008"
    │  19. Crea il Ticket nel DB con numero="CAA008", stato="ATTESA"
    │  20. COMMIT transazione (tutto o niente)
    │  21. Chiama broadcast(areaId=1, { type: "TICKET_EMESSO", coda: 8 })
    ▼
[wsService.broadcast]
    │  22. Trova tutti i WebSocket connessi alla room areaId=1
    │  23. Manda il messaggio JSON a ciascuno
    ▼
[Browser Admin, Browser Operatore]
    │  24. Ricevono il messaggio WebSocket
    │  25. Aggiornano il counter della coda in tempo reale
    ▼
[Torna alla route ticket.ts]
    │  26. Chiama pdfService.generateTicketPdf({ numero: "CAA008", ... })
    │  27. Genera il PDF A5 come Buffer di bytes
    │  28. Converte in Base64 (stringa di testo)
    │  29. Risponde con JSON:
    │      { ticket: { id, numero, ... }, pdf: "JVBERi0xLj..." }
    ▼
[Browser Accoglienza]
    │  30. Riceve la risposta
    │  31. Decodifica il PDF da Base64 a bytes
    │  32. Crea un Blob (file in memoria)
    │  33. Apre una nuova finestra con il PDF
    │  34. Chiama window.print() → dialogo di stampa
```

---

## 9. Autenticazione JWT — come funziona

### Cos'è un JWT (JSON Web Token)

Un JWT è una stringa in 3 parti separate da punto:
```
eyJhbGciOiJIUzI1NiJ9  .  eyJzdWIiOjEsInVzZXJuYW1lIjoibWFyaW8ifQ  .  xK8dJ2mNpQs...
      HEADER                           PAYLOAD                           FIRMA
```

- **Header**: algoritmo usato (HS256)
- **Payload**: dati dell'utente (id, username, ruolo, aree)
- **Firma**: HMAC del header+payload con il JWT_SECRET

Il payload è in Base64 — non criptato, leggibile da chiunque. **MA** non può essere modificato senza invalidare la firma. Quindi il server può fidarsi dei dati senza fare una query al DB ad ogni richiesta.

### Il flusso login (multi-ruolo)

Il login avviene in **due fasi**:

```
FASE 1 — Verifica credenziali
1. Browser: POST /api/auth/login { username, password }
2. Server:  verifica password con bcrypt
3. Server:  restituisce un PENDING TOKEN (scade in 5 min) + lista ruoli disponibili
   { pendingToken: "eyJ...", user: { ruoli: ["ADMIN","OPERATORE"], ... } }

FASE 2 — Selezione ruolo (se > 1 ruolo)
4. Browser: mostra la schermata di selezione ruolo
5. Utente: sceglie "ADMIN"
6. Browser: POST /api/auth/select-role { pendingToken, ruolo: "ADMIN" }
7. Server:  verifica che il pending token sia valido e che il ruolo richiesto
            sia nella lista dei ruoli dell'utente
8. Server:  emette il JWT DEFINITIVO con ruolo="ADMIN"
   { token: "eyJ...", user: { ruolo: "ADMIN", ... } }

9. Browser: salva il token definitivo in localStorage
10. Browser: naviga alla dashboard /admin
```

Se l'utente ha **un solo ruolo**, la fase 2 avviene automaticamente senza mostrare la schermata di selezione.

### Il Pending Token

Il pending token ha `ruolo: "__PENDING__"` nel payload. Il middleware `authenticate` lo **blocca** — non è valido per nessuna route normale. Serve solo per chiamare `/api/auth/select-role`.

Questo impedisce che qualcuno usi il token intermedio per fare richieste API.

### L'auto-refresh del token

Il token definitivo scade dopo 60 minuti. Se l'utente sta lavorando attivamente, il server lo rinnova automaticamente: se mancano meno di 10 minuti alla scadenza, aggiunge nell'header della risposta:
```
X-Renewed-Token: eyJ...nuovo_token...
```
Il frontend lo legge e salva il nuovo token automaticamente.

### Perché bcrypt per le password?

Le password non vengono mai salvate in chiaro. Si salva solo l'**hash**:
```typescript
const hash = await bcrypt.hash("miaPassword123!", 12);
// "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhy"
```

Il numero `12` è il **cost factor** — indica quante operazioni fare (2^12 = 4096 iterazioni).
Più alto è, più tempo ci vuole per calcolare l'hash (protegge dagli attacchi brute-force).

---

## 10. I ruoli utente e i permessi

### Un utente può avere più ruoli

A differenza di molti sistemi, in Saltacode un utente può avere **più ruoli contemporaneamente**. Ad esempio, un responsabile di sede potrebbe essere sia `ADMIN` (gestisce i servizi) che `OPERATORE` (chiama i numeri se un collega è assente).

La struttura nel database è una tabella `utenti_ruoli` (many-to-many):
```
Utente ←──── utenti_ruoli ────→ Ruolo
  id=1  ←──── utenteId=1  ──── ruoloId=2 (ADMIN)
        ←──── utenteId=1  ──── ruoloId=4 (OPERATORE)
```

### Il flusso di selezione ruolo

Dopo il login, se l'utente ha più ruoli, vede una **schermata di selezione**:
```
┌─────────────────────────────────┐
│  Benvenuto, Mario               │
│  Scegli con quale ruolo accedere│
│                                 │
│  👑 SUPERADMIN                  │
│  📋 ADMIN                       │
│  🎫 ACCOGLIENZA                 │
│  🖥️ OPERATORE                  │
└─────────────────────────────────┘
```

Il ruolo scelto viene incluso nel JWT definitivo e determina:
- Quale dashboard viene mostrata
- Quali endpoint API sono accessibili
- Quali dati vengono restituiti (filtrati per area)

### Il sistema di autorizzazione

Il middleware `authorize()` blocca le richieste con ruolo sbagliato:

```typescript
// Solo SuperAdmin può vedere le aree
router.get('/api/aree', authenticate, authorize('SUPERADMIN'), handler);

// Admin e SuperAdmin possono gestire utenti
router.post('/api/utenti', authenticate, authorize('SUPERADMIN', 'ADMIN'), handler);
```

### Restrizioni per ruolo

| Endpoint | SUPERADMIN | ADMIN | ACCOGLIENZA | OPERATORE |
|---|:---:|:---:|:---:|:---:|
| GET /api/aree | ✓ (tutti) | ✗ | ✗ | ✗ |
| POST /api/aree | ✓ | ✗ | ✗ | ✗ |
| GET /api/utenti | ✓ (tutti) | ✓ (sua area) | ✗ | ✗ |
| POST /api/utenti | ✓ (qualsiasi ruolo) | ✓ (solo OPERATORE) | ✗ | ✗ |
| GET /api/servizi | ✓ | ✓ (sua area) | ✓ (sua area) | ✓ (sua area) |
| POST /api/servizi | ✓ | ✓ (sua area) | ✗ | ✗ |
| POST /api/ticket | ✗ | ✗ | ✓ | ✗ |
| POST /api/chiamate | ✗ | ✗ | ✗ | ✓ |
| GET /api/monitor/* | pubblico | pubblico | pubblico | pubblico |

---

## 11. Come funziona l'emissione di un ticket

Questa è la parte più delicata del sistema perché due Accoglienze potrebbero premere "Stampa Ticket" nello stesso momento. Senza precauzioni potrebbero uscire due ticket con lo stesso numero.

La soluzione è una **transazione database con lock**:

```typescript
// ticketService.ts
return await prisma.$transaction(async (tx) => {
    
    // 1. Leggi il contatore di oggi
    const contatore = await tx.contatoreGiornaliero.findUnique({
        where: { servizioId_data: { servizioId, data: oggi } }
    });
    
    // 2. Incrementa in modo atomico (UPSERT)
    const nuovoNumero = (contatore?.ultimoNumero ?? 0) + 1;
    
    await tx.contatoreGiornaliero.upsert({
        where: { servizioId_data: { servizioId, data: oggi } },
        update: { ultimoNumero: nuovoNumero },
        create: { servizioId, data: oggi, ultimoNumero: nuovoNumero }
    });
    
    // 3. Genera il numero nel formato: PREFISSO(2) + LETTERA(1) + PROGRESSIVO(3)
    // es: CA + A + 008 = "CAA008"
    const numero = `${area.prefisso}${servizio.lettera}${String(nuovoNumero).padStart(3, '0')}`;
    
    // 4. Crea il ticket
    const ticket = await tx.ticket.create({
        data: { servizioId, numero, stato: 'ATTESA' }
    });
    
    return ticket;
    // SE QUALCOSA VA MALE QUI → tutto viene annullato (ROLLBACK)
});
```

La **transazione** garantisce che le operazioni 1-4 siano atomiche: o avvengono tutte, o non avviene niente. PostgreSQL usa il locking a livello di riga per impedire che due transazioni incrementino lo stesso contatore contemporaneamente.

Il contatore si azzera ogni giorno perché è legato alla `data` — ogni giorno si ricomincia da 001.

---

## 12. Come funziona la chiamata di un numero

```typescript
// queueService.ts
export async function callNext(servizioId, postazione, utenteId) {
    
    // 1. Trova il ticket più vecchio in ATTESA (FIFO: First In First Out)
    const ticket = await prisma.ticket.findFirst({
        where: { servizioId, stato: 'ATTESA' },
        orderBy: { emessoPer: 'asc' }  // il più vecchio prima
    });
    
    if (!ticket) return null; // coda vuota
    
    // 2. Transazione: crea chiamata + aggiorna stato ticket
    const [chiamata] = await prisma.$transaction([
        prisma.chiamata.create({
            data: { utenteId, servizioId, ticketId: ticket.id, postazione }
        }),
        prisma.ticket.update({
            where: { id: ticket.id },
            data: { stato: 'CHIAMATO' }
        })
    ]);
    
    // 3. Manda evento WebSocket a tutta l'area + monitor
    broadcastAll(areaId, {
        type: 'NUMERO_CHIAMATO',
        ticket: ticket.numero,
        postazione,
        servizio: servizio.nome,
        timestamp: new Date().toISOString()
    });
    
    return { chiamataId: chiamata.id, ticketNumero: ticket.numero, postazione };
}
```

L'operatore può anche **annullare** l'ultima chiamata (errore di click):
```typescript
// Cancella la chiamata dal DB
// Rimette il ticket in stato ATTESA con data "1970" (torna in testa alla coda)
prisma.ticket.update({
    where: { id: chiamata.ticketId },
    data: { stato: 'ATTESA', emessoPer: new Date(0) }  // new Date(0) = 1 Jan 1970
});
```

---

## 13. Il Deploy sulla VM Ubuntu

### Il concetto di base

In sviluppo (sul tuo PC) usi:
- `npm run dev` per il backend (con tsx watch, si riavvia ad ogni modifica)
- `npm run dev` per il frontend (Vite con hot reload)

In produzione (sulla VM) non puoi usare questi comandi perché:
1. Non c'è nessuno a guardare il terminale
2. Se il server crasha, nessuno lo riavvia
3. Il codice deve partire automaticamente al boot della VM

La soluzione è:

```
[Ubuntu Boot]
    ↓
systemd avvia PostgreSQL  ← database
    ↓
systemd avvia PM2         ← gestore processi Node.js
    ↓
PM2 avvia saltacode-backend  ← il nostro server Node.js
    ↓
systemd avvia Nginx       ← web server / reverse proxy
```

### Perché non esporre Node.js direttamente

Node.js potrebbe servire direttamente le richieste HTTP sulla porta 80/443, ma non è una buona pratica:
- Node.js non è ottimizzato per servire file statici
- Nginx gestisce meglio la sicurezza, compressione, caching
- Nginx può fare HTTPS (SSL) in modo trasparente
- Se il backend crasha, Nginx può mostrare una pagina di manutenzione

---

## 14. Nginx — il reverse proxy

### Cos'è un reverse proxy

Un proxy normale sta davanti al client (es. VPN aziendale).
Un **reverse proxy** sta davanti al server — riceve le richieste e le smista:

```
Internet → Nginx (porta 80) → scelta:
    /              → serve file statici da /opt/saltacode/frontend/dist/
    /api/*         → forward a Node.js porta 3000
    /ws            → forward a Node.js porta 3000 (con upgrade WebSocket)
```

### La configurazione Nginx spiegata

```nginx
server {
    listen 80;       # ascolta su porta 80 (HTTP standard)
    server_name _;   # risponde a qualsiasi hostname/IP

    # Dove trovare i file del frontend (compilati da Vite)
    root /opt/saltacode/frontend/dist;
    index index.html;

    # SPA Routing: se il file non esiste → manda index.html
    # Necessario perché React Router gestisce le route lato browser
    # Senza questo, /superadmin darebbe 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy per le API backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;  # forward a Node.js
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;  # passa l'IP reale del client
    }

    # Proxy per WebSocket (protocollo diverso da HTTP)
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # Questi header sono necessari per l'upgrade del protocollo HTTP → WS
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;  # 1 ora: connessioni WS sono longpoll
    }
}
```

---

## 15. PM2 — il gestore dei processi

### Cos'è PM2

PM2 è un **process manager** per Node.js. Risolve il problema: "se il server Node crasha, chi lo riavvia?".

Con PM2:
```bash
pm2 start backend/src/server.ts --name saltacode-backend
```

PM2 avvia il processo e lo monitora. Se crasha → lo riavvia automaticamente.

### ecosystem.config.cjs

Il file di configurazione di PM2:
```javascript
module.exports = {
    apps: [{
        name: 'saltacode-backend',
        cwd: '/opt/saltacode/backend',
        script: 'src/server.ts',          // file di avvio
        interpreter: 'node',
        interpreter_args: '--import tsx/esm', // usa tsx per eseguire TypeScript
        instances: 1,                     // 1 processo (basta per un ufficio)
        autorestart: true,                // riavvia se crasha
        max_memory_restart: '512M',       // riavvia se usa troppa RAM
        error_file: '/var/log/saltacode/pm2-error.log',
        out_file: '/var/log/saltacode/pm2-out.log',
    }]
};
```

### Avvio automatico al boot

```bash
pm2 save           # salva la lista dei processi
pm2 startup systemd  # genera il comando per registrare PM2 come servizio systemd
# → copia ed esegui il comando che stampa
```

Questo crea un servizio systemd `pm2-saltacode` che si avvia automaticamente ad ogni boot.

### Comandi PM2 utili

```bash
pm2 status                          # lista tutti i processi
pm2 logs saltacode-backend          # log in tempo reale
pm2 logs saltacode-backend --lines 100  # ultimi 100 log
pm2 restart saltacode-backend       # riavvia
pm2 stop saltacode-backend          # ferma
pm2 monit                           # dashboard interattiva
```

---

## 16. Il file .env — configurazione dell'ambiente

Il file `.env` contiene le variabili d'ambiente — impostazioni che cambiano tra sviluppo e produzione senza modificare il codice.

```bash
# Chi siamo (development / production)
NODE_ENV=production

# Porta del server backend
PORT=3000

# Stringa di connessione al database
# formato: postgresql://UTENTE:PASSWORD@HOST:PORTA/NOME_DB?schema=public
DATABASE_URL="postgresql://saltacode:saltacode_db@localhost:5432/saltacode_db?schema=public"

# Chiave segreta per firmare i JWT — DEVE essere lunga e casuale in produzione
# Puoi generarla con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="stringa-segreta-lunga-almeno-64-caratteri"

# Costo dell'hash bcrypt — 12 è il minimo raccomandato (2^12 iterazioni)
BCRYPT_COST_FACTOR=12

# Da quale origine può fare richieste il browser (CORS)
# In produzione metti l'URL esatto: http://192.168.1.100
CORS_ORIGIN=*

# Dove salvare i log
LOG_DIR=/var/log/saltacode
```

**⚠️ Il file `.env` non va MAI in git** (contiene password e segreti).
Per questo c'è `.env.example` con i nomi delle variabili ma senza i valori reali.

---

## 17. Cosa succede al boot della VM

Quando accendi la VM Ubuntu, systemd avvia i servizi nell'ordine corretto:

```
Boot Ubuntu
    ↓
systemd-networkd     → configura la rete
    ↓
postgresql.service   → PostgreSQL è pronto ad accettare connessioni
    ↓
pm2-saltacode.service → PM2 si avvia e legge la lista salvata
    ↓
    PM2 avvia saltacode-backend:
        1. Carica src/server.ts con tsx
        2. Legge .env (DATABASE_URL, JWT_SECRET, ...)
        3. prisma.$connect() → si connette a PostgreSQL
        4. createApp() → configura Express con tutti i middleware
        5. attachWebSocketServer() → WebSocket pronto
        6. server.listen(3000) → il server è UP
    ↓
nginx.service → Nginx si avvia e inizia ad ascoltare su porta 80
    ↓
[VM pronta — l'applicazione è accessibile da browser]
```

Se backend crasha → PM2 lo riavvia
Se Nginx crasha → systemd lo riavvia (RestartOnFailure)
Se PostgreSQL crasha → systemd lo riavvia

---

## 18. Come aggiornare il codice in produzione

Quando modifichi il codice sul tuo PC e vuoi aggiornare la VM:

```bash
# 1. Sul tuo PC — copia i nuovi file sulla VM
scp -r saltacode/backend/src/ utente@IP-VM:/opt/saltacode/backend/
scp -r saltacode/frontend/src/ utente@IP-VM:/opt/saltacode/frontend/

# 2. Sulla VM — ricompila il frontend
cd /opt/saltacode/frontend
npm run build   # genera nuovi file in dist/

# 3. Se hai cambiato lo schema del DB
cd /opt/saltacode/backend
npx prisma migrate deploy  # applica le nuove migrazioni

# 4. Riavvia solo il backend (il frontend è già aggiornato perché Nginx serve file statici)
pm2 restart saltacode-backend

# 5. Verifica che funzioni
pm2 logs saltacode-backend
curl http://localhost:3000/health
```

Nginx serve i file statici del frontend direttamente dalla cartella `dist/` — basta che la `npm run build` abbia aggiornato quei file. Non serve riavviare Nginx.

---

## 19. Problemi comuni e come risolverli

### P1000 — Prisma non riesce a connettersi al DB

```
PrismaClientInitializationError: P1000
```
**Cause e soluzioni:**
1. PostgreSQL non è in esecuzione: `sudo systemctl start postgresql`
2. Utente o database non esistono: crea con psql (vedi sezione 4)
3. Password sbagliata nel `DATABASE_URL`: verifica `.env`
4. PostgreSQL in ascolto su socket Unix, non TCP: controlla `/etc/postgresql/*/main/pg_hba.conf`

### Il backend non si avvia

```bash
pm2 logs saltacode-backend   # guarda l'errore
```
Errori comuni:
- `Missing required environment variable: JWT_SECRET` → manca la variabile nel `.env`
- `EADDRINUSE: address already in use 3000` → la porta è già occupata: `lsof -i :3000`

### La pagina non si carica (502 Bad Gateway)

502 da Nginx significa che il backend non risponde. Controlla:
```bash
pm2 status                    # il processo è UP?
curl http://localhost:3000/health  # risponde?
sudo systemctl status nginx   # Nginx è UP?
```

### I WebSocket non si connettono

Sintomo: il Monitor mostra "● Disconnesso" e non si aggiorna.
Verifica che Nginx abbia i header `Upgrade` e `Connection`:
```bash
sudo nginx -t   # test configurazione
sudo systemctl reload nginx
```

### Il seed non funziona

```bash
cd /opt/saltacode/backend
npx prisma db seed
```
Se dà errore di "ruolo già esistente" è perché lo hai già eseguito — è normale, il seed usa `upsert` quindi è idempotente (puoi rieseguirlo senza problemi).

---

## 20. Glossario dei termini tecnici

| Termine | Significato |
|---|---|
| **API** | Application Programming Interface — un set di URL che il frontend chiama per ottenere/inviare dati |
| **REST** | Stile architetturale per API: GET=leggi, POST=crea, PATCH=modifica, DELETE=elimina |
| **JWT** | JSON Web Token — un modo sicuro per trasmettere informazioni sull'utente tra client e server |
| **Middleware** | Funzione che si esegue tra la richiesta HTTP e la risposta |
| **ORM** | Object-Relational Mapper — astrazione che ti permette di usare il DB con oggetti invece di SQL |
| **Transazione** | Gruppo di operazioni DB che o avvengono tutte o non avviene nessuna |
| **WebSocket** | Protocollo di comunicazione bidirezionale persistente tra browser e server |
| **SPA** | Single Page Application — app web che non ricarica la pagina, gestisce la navigazione con JavaScript |
| **Reverse proxy** | Server che riceve richieste e le smista ad altri server interni |
| **Seed** | Dati iniziali inseriti nel DB per inizializzare l'applicazione |
| **Migration** | Script SQL che descrive un cambiamento alla struttura del database |
| **Hash** | Funzione a senso unico — da password → stringa cifrata, impossibile invertire |
| **Salt** | Valore casuale aggiunto alla password prima dell'hash per evitare attacchi rainbow table |
| **bcrypt** | Algoritmo di hash per password, lento di proposito (resistente al brute-force) |
| **CORS** | Cross-Origin Resource Sharing — meccanismo di sicurezza del browser per controllare quali siti possono fare richieste API |
| **PM2** | Process manager per Node.js — avvia, monitora e riavvia i processi |
| **systemd** | Sistema di init di Linux — gestisce l'avvio e il monitoraggio dei servizi |
| **ACID** | Atomicità, Consistenza, Isolamento, Durabilità — proprietà delle transazioni DB |
| **FIFO** | First In First Out — il primo ad arrivare è il primo ad essere servito |
| **Hot reload** | Il browser si aggiorna automaticamente quando salvi il codice |
| **Base64** | Encoding che converte dati binari (es. PDF) in testo ASCII trasmissibile via JSON |
| **Proxy** | Intermediario tra client e server |
| **Build** | Processo di compilazione che trasforma il codice sorgente in file ottimizzati per la produzione |
| **TypeScript** | Superset di JavaScript con tipizzazione statica |
| **Virtual DOM** | Rappresentazione in memoria del DOM usata da React per ottimizzare gli aggiornamenti |
