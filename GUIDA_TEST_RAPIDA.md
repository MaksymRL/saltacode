# 🧪 Saltacode — Guida Rapida al Testing

> Come testare che tutto funzioni correttamente dopo il deployment

---

## ⚡ Test Rapido (5 minuti)

### 1. Test Backend (API + Database)

```bash
# Vai nella directory backend
cd /opt/saltacode/backend

# Verifica che il server sia in esecuzione
pm2 status

# Test health check
curl -f http://localhost:3000/health
# ✅ Aspettato: {"status":"ok","database":"connected","uptime":"..."}

# Test database connection
curl -f http://localhost:3000/api/monitor/stato
# ✅ Aspettado: {"chiamate":[],"timestamp":"..."}
```

### 2. Test Frontend

```bash
# Apri nel browser
firefox http://your-vm-ip/

# Oppure testa che Nginx serva i file
curl -I http://localhost/
# ✅ Aspettato: HTTP/1.1 200 OK
```

### 3. Test Login

1. **Vai alla pagina login**: http://your-vm-ip/
2. **Credenziali di default**:
   - Username: `superadmin`
   - Password: `Change123!` (cambiarla al primo accesso)
3. **Verifica selezione ruolo**: Dovrebbe mostrare ruoli disponibili
4. **Accedi come SuperAdmin**: Dashboard con gestione aree/utenti

---

## 🔍 Test Completo del Flusso (15 minuti)

### FASE 1: Setup Iniziale (SuperAdmin)

**Login SuperAdmin**:
- URL: http://your-vm-ip/
- Username: `superadmin`  
- Password: `Change123!`

**Cambia password** (al primo accesso):
- Nuova password: qualsiasi che rispetti policy (10+ char, 1 maiuscola, 1 simbolo)

**Crea Area di test**:
- Nome: "Test CAF"
- Prefisso: "TC" (2 lettere maiuscole)
- ✅ Verifica: area creata in lista

**Crea utenti**:
```
Admin:
- Nome: Test
- Cognome: Admin  
- Ruolo: ADMIN
- Area: Test CAF
- ✅ Verifica: username auto-generato "tadmin"

Accoglienza:
- Nome: Test
- Cognome: Accoglienza
- Ruolo: ACCOGLIENZA  
- Area: Test CAF
- ✅ Username: "taccoglienza"

Operatore:
- Nome: Test
- Cognome: Operatore
- Ruolo: OPERATORE
- Area: Test CAF
- ✅ Username: "toperatore"
```

### FASE 2: Configurazione Servizi (Admin)

**Login Admin**:
- Username: `tadmin`
- Password: password temporanea generata
- Cambia password al primo accesso

**Crea servizi**:
```
Servizio 1:
- Nome: "730"
- Lettera: "A"
- ✅ Verifica: servizio attivo

Servizio 2:
- Nome: "ISEE" 
- Lettera: "B"
- ✅ Verifica: servizio attivo
```

**Assegna operatori**:
- Assegna "toperatore" ai servizi 730 e ISEE
- ✅ Verifica: operatore nella lista servizi

### FASE 3: Test Emissione Ticket (Accoglienza)

**Login Accoglienza**:
- Username: `taccoglienza`
- Password: password temporanea
- Cambia password

**Emetti ticket**:
- Seleziona servizio "730"
- Clicca "Stampa Ticket"
- ✅ Verifica: 
  - Numero formato: "TCA001" (TC=area, A=servizio, 001=progressivo)
  - PDF si apre per stampa
  - Contatore coda aumenta in tempo reale

**Emetti più ticket**:
- Stampa altri 3 ticket per "730"
- Stampa 2 ticket per "ISEE" 
- ✅ Verifica numerazione:
  - 730: TCA002, TCA003, TCA004
  - ISEE: TCB001, TCB002

### FASE 4: Test Gestione Code (Operatore)

**Login Operatore**:
- Username: `toperatore`
- Password: password temporanea
- Inserisci numero postazione: `1`

**Chiama numeri**:
- Servizio 730: clicca "Chiama Prossimo"
- ✅ Verifica:
  - Chiama TCA001 (primo della coda FIFO)
  - Contatore coda diminuisce
  - Monitor si aggiorna in tempo reale

**Test annullamento**:
- Clicca "Annulla Ultima Chiamata"
- ✅ Verifica: TCA001 torna in coda

### FASE 5: Test Monitor Pubblico

**Apri monitor**:
- URL: http://your-vm-ip/monitor
- ✅ Verifica:
  - Mostra ultimi numeri chiamati
  - Font grande per TV
  - Aggiornamento in tempo reale senza login

**Test audio TTS** (se browser supporta):
- Quando operatore chiama numero
- ✅ Verifica: annuncio vocale "Servizio 730, numero TCA001, postazione 1"

---

## 🔧 Test WebSocket Real-Time

### Test Connessione Multiple

1. **Apri 3 browser/tab**:
   - Tab 1: Accoglienza
   - Tab 2: Operatore  
   - Tab 3: Monitor

2. **Azioni test**:
   - Accoglienza emette ticket → Tab 2 e 3 si aggiornano istantaneamente
   - Operatore chiama numero → Tab 1 e 3 si aggiornano
   - Chiudi/riapri tab → reconnect automatico

3. **✅ Verifica timing**:
   - Aggiornamenti < 1 secondo
   - Nessun errore WebSocket nella console
   - Riconnessione automatica funziona

---

## ⚠️ Test Scenari di Errore

### Test Concorrenza Ticket

```bash
# Simula 2 utenti che stampano ticket contemporaneamente
# (serve tool come Apache Bench o simulazione script)

# Test manuale: Accoglienza emette ticket rapidamente
# ✅ Verifica: numeri sempre sequenziali, mai duplicati
```

### Test Resilienza Database

```bash
# Spegni temporaneamente PostgreSQL
sudo systemctl stop postgresql

# ✅ Verifica: 
# - /health ritorna errore database
# - Frontend mostra errore connessione
# - Dopo restart PostgreSQL tutto funziona
sudo systemctl start postgresql
```

### Test Memoria e Performance

```bash
# Monitor risorse
htop

# Test carico con molti WebSocket
# ✅ Verifica RAM < 200MB, CPU < 50% con 20+ connessioni
```

---

## 📊 Checklist Test Completa

### ✅ Backend
- [ ] Server avvia senza errori
- [ ] Health check OK
- [ ] Database connesso
- [ ] API autenticazione funziona
- [ ] JWT refresh automatico
- [ ] Rate limiting attivo (5 tentativi login)
- [ ] Backup automatico (controlla cron job)

### ✅ Frontend  
- [ ] Build production servito da Nginx
- [ ] Login multi-ruolo
- [ ] Dashboard per ogni ruolo
- [ ] Routing protetto funziona
- [ ] Auto-logout su token scaduto

### ✅ WebSocket
- [ ] Connessione real-time
- [ ] Room system (messaggi solo per area)
- [ ] Heartbeat/reconnect automatico
- [ ] Broadcast eventi (ticket/chiamate)

### ✅ Flusso Completo
- [ ] Emissione ticket con numerazione corretta
- [ ] Gestione code FIFO
- [ ] PDF generation e stampa
- [ ] Monitor pubblico aggiornato
- [ ] TTS annunci audio

### ✅ Sicurezza
- [ ] Password policy enforced
- [ ] Autorizzazioni per ruolo
- [ ] HTTPS/SSL (se configurato)
- [ ] Input validation attiva

### ✅ Production
- [ ] PM2 gestione processi
- [ ] Nginx reverse proxy
- [ ] Systemd services auto-start
- [ ] Log rotation attiva
- [ ] Monitoring errori

---

## 🐛 Risoluzione Problemi Comuni

### Server non parte
```bash
# Controlla log PM2
pm2 logs saltacode-backend

# Controlla porta occupata  
sudo netstat -tlnp | grep :3000

# Restart completo
pm2 restart saltacode-backend
```

### Database errori
```bash
# Controlla PostgreSQL
sudo systemctl status postgresql

# Test connessione diretta
sudo -u postgres psql -d saltacode -c "SELECT COUNT(*) FROM aree;"
```

### Frontend non carica
```bash
# Controlla Nginx
sudo systemctl status nginx

# Test file statici
ls -la /opt/saltacode/frontend/dist/

# Ricompila se necessario
cd /opt/saltacode/frontend && npm run build
```

### WebSocket errori
```bash
# Controlla browser console per errori WS
# Verifica firewall non blocca connessioni

# Test WebSocket manuale
wscat -c ws://localhost:3000/ws?token=YOUR_JWT_TOKEN
```

---

## 🎯 Test Performance

### Benchmark API
```bash
# Test endpoint più usati
ab -n 1000 -c 10 http://localhost:3000/health
ab -n 100 -c 5 -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/monitor/stato
```

### Test Memory Leaks
```bash
# Monitor per 1 ora con attività
watch -n 5 "ps aux | grep node"
```

### Test Concurrent WebSocket  
```bash
# Script per aprire 50+ connessioni simultanee
# Verifica: nessun drop connection, memoria stabile
```

---

## ✅ Certificazione Sistema

Una volta passati tutti i test:

**Il sistema Saltacode è PRODUCTION READY! 🎉**

- ✅ Tutti i requisiti core implementati  
- ✅ Real-time performance < 500ms
- ✅ Multi-user concurrent access
- ✅ Data integrity garantita
- ✅ Security hardened
- ✅ Production deployment completo

**Prossimi passi opzionali:**
- Monitoring avanzato (Grafana/Prometheus)
- Load balancing (se più istanze)
- Backup off-site automatico
- SSL/TLS certificate (Let's Encrypt)

---

*Guida creata automaticamente da Kiro AI per il sistema Saltacode v1.0*