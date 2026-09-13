import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';
import * as authService from '../services/authService.js';
import * as wsService from '../services/wsService.js';

const router = Router();

router.use(authenticate);

// ── Helper: includi sempre ruoli e aree ──────────────────────────────────────
const INCLUDE_UTENTE = {
  utentiRuoli: { include: { ruolo: { select: { id: true, nome: true } } } },
  utentiAree: { select: { areaId: true } },
} as const;

function sanitize(u: any) {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

/**
 * GET /api/utenti/operatori
 * Restituisce tutti gli operatori dell'area del richiedente con il loro stato.
 * Accessibile a: OPERATORE, ACCOGLIENZA, ADMIN, SUPERADMIN
 */
router.get('/operatori', authorize('SUPERADMIN', 'ADMIN', 'ACCOGLIENZA', 'OPERATORE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aree } = req.user!;
    const operatori = await prisma.utente.findMany({
      where: {
        utentiRuoli: { some: { ruolo: { nome: 'OPERATORE' } } },
        utentiAree: { some: { areaId: { in: aree } } },
        stato: { notIn: ['DISABILITATO', 'OFFLINE'] },
      },
      select: {
        id: true,
        username: true,
        cognome: true,
        nome: true,
        stato: true,
        utentiAree: { select: { areaId: true } },
        chiamate: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { postazione: true },
        },
      },
      orderBy: [{ cognome: 'asc' }, { nome: 'asc' }],
    });
    res.json(operatori.map((op) => ({
      id: op.id,
      username: op.username,
      cognome: op.cognome,
      nome: op.nome,
      stato: op.stato,
      postazione: op.chiamate[0]?.postazione ?? null,
      utentiAree: op.utentiAree,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/utenti
 * SUPERADMIN → tutti; ADMIN → solo utenti nella propria area
 */
router.get('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ruolo, aree } = req.user!;
    const isSuperAdmin = ruolo === 'SUPERADMIN';

    const utenti = await prisma.utente.findMany({
      where: isSuperAdmin
        ? {}
        : { utentiAree: { some: { areaId: { in: aree } } } },
      include: INCLUDE_UTENTE,
      orderBy: [{ cognome: 'asc' }, { nome: 'asc' }],
    });

    res.json(utenti.map(sanitize));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/utenti
 * SUPERADMIN → può creare qualsiasi ruolo
 * ADMIN → solo ACCOGLIENZA e OPERATORE nella propria area (NON può creare ADMIN/SUPERADMIN)
 *
 * Body: { cognome, nome, ruoli: string[], aree: number[] }
 * Response: { ...utente, tempPassword: string }
 */
router.post('/', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cognome, nome, ruoli: ruoliRichiesti, aree, password: passwordCustom } = req.body as {
      cognome?: string;
      nome?: string;
      ruoli?: string[];
      aree?: number[];
      password?: string;
    };

    const missing: string[] = [];
    if (!cognome) missing.push('cognome');
    if (!nome) missing.push('nome');
    if (!ruoliRichiesti || ruoliRichiesti.length === 0) missing.push('ruoli');
    if (!aree || aree.length === 0) missing.push('aree');
    if (missing.length > 0) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: missing });
      return;
    }

    const requester = req.user!;

    // ADMIN: può creare solo ACCOGLIENZA e OPERATORE nella propria area
    if (requester.ruolo === 'ADMIN') {
      const ruoliNonConsentiti = ruoliRichiesti!.filter(
        (r) => !['ACCOGLIENZA', 'OPERATORE'].includes(r)
      );
      if (ruoliNonConsentiti.length > 0) {
        res.status(403).json({ error: "L'Admin può assegnare solo i ruoli ACCOGLIENZA e OPERATORE." });
        return;
      }
      const areeNonAutorizzate = aree!.filter((a) => !requester.aree.includes(Number(a)));
      if (areeNonAutorizzate.length > 0) {
        res.status(403).json({ error: 'Non autorizzato a creare utenti in queste aree.' });
        return;
      }
    }

    // Verifica che tutte le aree selezionate siano attive
    if (aree && aree.length > 0) {
      const areeDB = await prisma.area.findMany({
        where: { id: { in: aree.map(Number) } },
        select: { id: true, nome: true, attiva: true },
      });
      const areeDisabilitate = areeDB.filter((a) => !a.attiva);
      if (areeDisabilitate.length > 0) {
        res.status(400).json({
          error: `Non puoi assegnare aree disabilitate: ${areeDisabilitate.map((a) => a.nome).join(', ')}`,
        });
        return;
      }
    }

    // Verifica che i ruoli richiesti esistano
    const ruoliDB = await prisma.ruolo.findMany({
      where: { nome: { in: ruoliRichiesti } },
    });
    if (ruoliDB.length !== ruoliRichiesti!.length) {
      res.status(400).json({ error: 'Uno o più ruoli non validi.' });
      return;
    }

    // Genera username univoco
    const baseUsername = authService.generateUsername(nome!, cognome!);
    let username = baseUsername;
    let suffix = 2;
    while (await prisma.utente.findUnique({ where: { username } })) {
      username = `${baseUsername}${suffix++}`;
      if (suffix > 999) {
        res.status(409).json({ error: 'Impossibile generare username univoco.' });
        return;
      }
    }

    // Valida password personalizzata se fornita
    if (passwordCustom && !authService.validatePassword(passwordCustom)) {
      res.status(400).json({
        error: 'La password non rispetta la policy: minimo 10 caratteri, 1 maiuscola, 1 carattere speciale.',
      });
      return;
    }

    const tempPassword = passwordCustom ? undefined : authService.generateTempPassword();
    const passwordDaUsare = passwordCustom ?? tempPassword!;
    const passwordHash = await authService.hashPassword(passwordDaUsare);
    const mustChangePwd = !passwordCustom; // se l'admin imposta la password, non forza il cambio

    // Utente creato offline — diventa ATTIVO solo al primo login
    const utente = await prisma.utente.create({
      data: {
        username,
        cognome: cognome!.trim(),
        nome: nome!.trim(),
        passwordHash,
        mustChangePwd: mustChangePwd,
        stato: 'OFFLINE',
        utentiRuoli: {
          create: ruoliDB.map((r) => ({ ruoloId: r.id })),
        },
        utentiAree: {
          create: aree!.map((areaId) => ({ areaId: Number(areaId) })),
        },
      },
      include: INCLUDE_UTENTE,
    });

    res.status(201).json({ ...sanitize(utente), tempPassword: tempPassword ?? null });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Username già in uso.' });
      return;
    }
    next(err);
  }
});

/**
 * PATCH /api/utenti/me
 * Permette all'utente autenticato di aggiornare nome, cognome e password.
 * Lo username viene rigenerato automaticamente da nome+cognome.
 * Body: { cognome?, nome?, currentPassword?, newPassword? }
 */
router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { currentPassword, newPassword, cognome, nome } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      cognome?: string;
      nome?: string;
    };

    const utente = await prisma.utente.findUnique({ where: { id: user.sub } });
    if (!utente) { res.status(404).json({ error: 'Utente non trovato.' }); return; }

    const data: Record<string, unknown> = {};

    // ── Cambio nome/cognome → rigenera username automaticamente ────────────
    if (cognome !== undefined) {
      const trimmed = cognome.trim();
      if (trimmed.length < 2 || trimmed.length > 50) {
        res.status(400).json({ error: 'Cognome non valido: 2-50 caratteri.' }); return;
      }
      data['cognome'] = trimmed;
    }
    if (nome !== undefined) {
      const trimmed = nome.trim();
      if (trimmed.length < 2 || trimmed.length > 50) {
        res.status(400).json({ error: 'Nome non valido: 2-50 caratteri.' }); return;
      }
      data['nome'] = trimmed;
    }

    if (cognome !== undefined || nome !== undefined) {
      const nuovoCognome = (data['cognome'] as string ?? utente.cognome).trim();
      const nuovoNome = (data['nome'] as string ?? utente.nome).trim();
      const baseUsername = authService.generateUsername(nuovoNome, nuovoCognome);
      let newUsernameGen = baseUsername;
      let suffix = 2;
      while (true) {
        const existing = await prisma.utente.findUnique({ where: { username: newUsernameGen } });
        if (!existing || existing.id === user.sub) break;
        newUsernameGen = `${baseUsername}${suffix++}`;
        if (suffix > 999) break;
      }
      data['username'] = newUsernameGen;
    }

    // ── Cambio password ─────────────────────────────────────────────────────
    if (newPassword !== undefined) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Inserire la password attuale per cambiare la password.' }); return;
      }
      const match = await authService.comparePassword(currentPassword, utente.passwordHash);
      if (!match) {
        res.status(401).json({ error: 'Password attuale non corretta.' }); return;
      }
      if (!authService.validatePassword(newPassword)) {
        res.status(400).json({ error: 'La nuova password non rispetta la policy: minimo 10 caratteri, 1 maiuscola, 1 carattere speciale.' }); return;
      }
      data['passwordHash'] = await authService.hashPassword(newPassword);
      data['mustChangePwd'] = false;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nessun campo da aggiornare.' }); return;
    }

    const updated = await prisma.utente.update({ where: { id: user.sub }, data });

    res.json({
      message: 'Profilo aggiornato con successo.',
      username: updated.username,
      nome: updated.nome,
      cognome: updated.cognome,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Username già in uso.' }); return;
    }
    next(err);
  }
});

/**
 * PATCH /api/utenti/me/stato
 * Body: { stato: 'ATTIVO' | 'PAUSA' }
 */
router.patch('/me/stato', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { stato } = req.body as { stato?: string };

    if (!stato) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['stato'] }); return;
    }
    if (!['ATTIVO', 'PAUSA'].includes(stato)) {
      res.status(400).json({ error: 'Stato non valido. Valori ammessi: ATTIVO, PAUSA' }); return;
    }

    const utente = await prisma.utente.findUnique({
      where: { id: user.sub },
      include: { utentiAree: true, utentiRuoli: { include: { ruolo: true } } },
    });
    if (!utente) { res.status(404).json({ error: 'Utente non trovato.' }); return; }

    const hasOperatoreRole = utente.utentiRuoli.some((ur) => ur.ruolo.nome === 'OPERATORE');
    if (!hasOperatoreRole) {
      res.status(403).json({ error: 'Solo gli operatori possono modificare il proprio stato.' }); return;
    }

    const updatedUtente = await prisma.utente.update({
      where: { id: user.sub },
      data: { stato },
      include: INCLUDE_UTENTE,
    });

    const ultimaChiamata = await prisma.chiamata.findFirst({
      where: { utenteId: user.sub },
      orderBy: { timestamp: 'desc' },
      select: { postazione: true },
    });

    const utenteAree = updatedUtente.utentiAree.map((ua) => ua.areaId);
    utenteAree.forEach((areaId) => {
      wsService.broadcastAll(areaId, {
        type: 'STATO_OPERATORE',
        utenteId: updatedUtente.id,
        username: updatedUtente.username,
        stato: stato as 'ATTIVO' | 'PAUSA' | 'DISABILITATO',
        postazione: ultimaChiamata?.postazione ?? null,
        pausaInizio: stato === 'PAUSA' ? new Date().toISOString() : null,
      });
    });

    res.json(sanitize(updatedUtente));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/utenti/:id
 * SUPERADMIN → qualsiasi utente
 * ADMIN → solo utenti della propria area (non può modificare ADMIN/SUPERADMIN)
 *
 * Body: { cognome?, nome?, stato?, aree?, ruoli?: string[], resetPassword?: true, newPassword?: string }
 */
router.patch('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const requester = req.user!;

    // Carica l'utente target con ruoli
    const target = await prisma.utente.findUnique({
      where: { id },
      include: { 
        utentiAree: true,
        utentiRuoli: { include: { ruolo: true } }
      },
    });
    if (!target) {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }

    const targetRuoli = target.utentiRuoli.map((ur) => ur.ruolo.nome);
    
    // ADMIN: controlli di permessi più restrittivi
    if (requester.ruolo === 'ADMIN') {
      // Non può modificare utenti con ruolo ADMIN o SUPERADMIN
      if (targetRuoli.includes('ADMIN') || targetRuoli.includes('SUPERADMIN')) {
        res.status(403).json({ error: 'Non autorizzato a modificare utenti Admin o SuperAdmin.' });
        return;
      }
      
      // Solo utenti della propria area
      const targetAree = target.utentiAree.map((ua) => ua.areaId);
      if (!targetAree.some((a) => requester.aree.includes(a))) {
        res.status(403).json({ error: 'Non autorizzato a modificare questo utente.' });
        return;
      }
    }

    const { cognome, nome, stato, aree, ruoli: nuoviRuoli, resetPassword, newPassword } = req.body as {
      cognome?: string;
      nome?: string;
      stato?: string;
      aree?: number[];
      ruoli?: string[];
      resetPassword?: boolean;
      newPassword?: string;
    };

    // ADMIN: non può assegnare ruoli ADMIN o SUPERADMIN
    if (requester.ruolo === 'ADMIN' && nuoviRuoli) {
      if (nuoviRuoli.includes('ADMIN') || nuoviRuoli.includes('SUPERADMIN')) {
        res.status(403).json({ error: 'Admin non può assegnare ruoli Admin o SuperAdmin.' });
        return;
      }
    }

    const data: Record<string, unknown> = {};
    if (cognome !== undefined) data['cognome'] = cognome.trim();
    if (nome !== undefined) data['nome'] = nome.trim();

    // Se cambiano nome o cognome, aggiorna lo username di conseguenza
    if (cognome !== undefined || nome !== undefined) {
      const nuovoCognome = (cognome ?? target.cognome).trim();
      const nuovoNome = (nome ?? target.nome).trim();
      const baseUsername = authService.generateUsername(nuovoNome, nuovoCognome);
      // Solo se lo username attuale era quello generato automaticamente (non personalizzato)
      // Lo aggiorniamo sempre quando admin/superadmin cambiano nome/cognome
      let newUsername = baseUsername;
      let suffix = 2;
      while (true) {
        const existing = await prisma.utente.findUnique({ where: { username: newUsername } });
        if (!existing || existing.id === id) break;
        newUsername = `${baseUsername}${suffix++}`;
        if (suffix > 999) break;
      }
      data['username'] = newUsername;
    }

    if (stato !== undefined) {
      const valid = ['ATTIVO', 'PAUSA', 'DISABILITATO', 'OFFLINE'];
      if (!valid.includes(stato)) {
        res.status(400).json({ error: `Stato non valido. Valori ammessi: ${valid.join(', ')}` });
        return;
      }
      // Riabilitare un utente lo rimette OFFLINE, non ATTIVO
      // Diventerà ATTIVO solo al prossimo login
      data['stato'] = stato === 'ATTIVO' ? 'OFFLINE' : stato;
    }

    let tempPassword: string | undefined;
    
    // Reset password automatico
    if (resetPassword) {
      tempPassword = authService.generateTempPassword();
      data['passwordHash'] = await authService.hashPassword(tempPassword);
      data['mustChangePwd'] = true;
    }
    
    // Cambio password specifica da parte dell'Admin/SuperAdmin
    if (newPassword) {
      if (!authService.validatePassword(newPassword)) {
        res.status(400).json({
          error: 'La nuova password non rispetta la policy: minimo 10 caratteri, 1 maiuscola, 1 carattere speciale.',
        });
        return;
      }
      data['passwordHash'] = await authService.hashPassword(newPassword);
      data['mustChangePwd'] = false; // Se l'admin imposta una password specifica, non forza il cambio
    }

    const utente = await prisma.$transaction(async (tx) => {
      // Aggiorna aree se fornite
      if (aree !== undefined) {
        // ADMIN: può assegnare solo alle proprie aree
        if (requester.ruolo === 'ADMIN') {
          const areeNonAutorizzate = aree.filter((a) => !requester.aree.includes(Number(a)));
          if (areeNonAutorizzate.length > 0) {
            throw new Error('Non autorizzato ad assegnare utenti a queste aree.');
          }
        }
        
        await tx.utenteArea.deleteMany({ where: { utenteId: id } });
        await tx.utenteArea.createMany({
          data: aree.map((areaId) => ({ utenteId: id, areaId: Number(areaId) })),
        });
      }

      // Aggiorna ruoli se forniti
      if (nuoviRuoli !== undefined) {
        const ruoliDB = await tx.ruolo.findMany({ where: { nome: { in: nuoviRuoli } } });
        if (ruoliDB.length !== nuoviRuoli.length) {
          throw new Error('Uno o più ruoli non validi.');
        }
        await tx.utenteRuolo.deleteMany({ where: { utenteId: id } });
        await tx.utenteRuolo.createMany({
          data: ruoliDB.map((r) => ({ utenteId: id, ruoloId: r.id })),
        });
      }

      return tx.utente.update({
        where: { id },
        data,
        include: INCLUDE_UTENTE,
      });
    });

    // Se lo stato è cambiato, invia broadcast WebSocket
    if (stato && target.stato !== stato) {
      // Trova le aree dell'utente per il broadcast
      const utenteAree = utente.utentiAree.map((ua) => ua.areaId);
      const isOperatore = utente.utentiRuoli.some((ur) => ur.ruolo.nome === 'OPERATORE');
      
      if (isOperatore) {
        // Invia aggiornamento stato operatore a tutte le aree dell'utente
        utenteAree.forEach((areaId) => {
          wsService.broadcastAll(areaId, {
            type: 'STATO_OPERATORE',
            utenteId: utente.id,
            username: utente.username,
            stato: stato as 'ATTIVO' | 'PAUSA' | 'DISABILITATO',
          });
        });
      }
    }

    res.json(tempPassword ? { ...sanitize(utente), tempPassword } : sanitize(utente));
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }
    if (err?.message) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * DELETE /api/utenti/:id
 * SUPERADMIN → qualsiasi utente (tranne se stesso)
 * ADMIN → solo utenti della propria area che non sono ADMIN o SUPERADMIN
 */
router.delete('/:id', authorize('SUPERADMIN', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params['id'] ?? '', 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'ID non valido.' });
      return;
    }

    const requester = req.user!;

    // Non può eliminare se stesso
    if (requester.sub === id) {
      res.status(403).json({ error: 'Non puoi eliminare il tuo stesso account.' });
      return;
    }

    const target = await prisma.utente.findUnique({
      where: { id },
      include: {
        utentiAree: true,
        utentiRuoli: { include: { ruolo: true } },
      },
    });

    if (!target) {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }

    const targetRuoli = target.utentiRuoli.map((ur) => ur.ruolo.nome);

    // ADMIN: non può eliminare ADMIN o SUPERADMIN
    if (requester.ruolo === 'ADMIN') {
      if (targetRuoli.includes('ADMIN') || targetRuoli.includes('SUPERADMIN')) {
        res.status(403).json({ error: 'Non autorizzato a eliminare utenti Admin o SuperAdmin.' });
        return;
      }
      // Solo utenti della propria area
      const targetAree = target.utentiAree.map((ua) => ua.areaId);
      if (!targetAree.some((a) => requester.aree.includes(a))) {
        res.status(403).json({ error: 'Non autorizzato a eliminare questo utente.' });
        return;
      }
    }

    // Elimina prima i record con FK RESTRICT, poi l'utente
    await prisma.$transaction([
      // Scollega operatore dai servizi
      prisma.operatoreServizio.deleteMany({ where: { utenteId: id } }),
      // Anonimizza le chiamate (preserva lo storico ma rimuove il riferimento all'utente)
      // oppure elimina direttamente se preferisci pulizia totale
      prisma.chiamata.deleteMany({ where: { utenteId: id } }),
    ]);

    // Ora elimina l'utente (cascade elimina utenti_ruoli e utenti_aree)
    await prisma.utente.delete({ where: { id } });

    res.status(204).send();
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/utenti/change-password
 * Body: { currentPassword: string, newPassword: string }
 */
router.post('/change-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Campi obbligatori mancanti.', fields: ['currentPassword', 'newPassword'] });
      return;
    }

    if (!authService.validatePassword(newPassword)) {
      res.status(400).json({
        error: 'La nuova password non rispetta la policy: minimo 10 caratteri, 1 maiuscola, 1 carattere speciale.',
      });
      return;
    }

    const utente = await prisma.utente.findUnique({ where: { id: user.sub } });
    if (!utente) {
      res.status(404).json({ error: 'Utente non trovato.' });
      return;
    }

    const bc = await import('bcrypt');
    const match = await bc.compare(currentPassword, utente.passwordHash);
    if (!match) {
      res.status(401).json({ error: 'Password attuale non corretta.' });
      return;
    }

    const passwordHash = await authService.hashPassword(newPassword);
    await prisma.utente.update({ where: { id: user.sub }, data: { passwordHash, mustChangePwd: false } });

    res.json({ message: 'Password aggiornata con successo.' });
  } catch (err) {
    next(err);
  }
});

export default router;
