import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../monitor-config.json');

interface MonitorConfig {
  voiceEnabled: boolean;
}

function readConfig(): MonitorConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as MonitorConfig;
  } catch {
    return { voiceEnabled: false }; // default: voce disabilitata
  }
}

function writeConfig(cfg: MonitorConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

const router = Router();

/**
 * GET /api/monitor/token
 * Pubblico — restituisce un JWT con ruolo MONITOR per la connessione WebSocket
 * del display pubblico (TV/schermo). Il token non ha scadenza e viene rigenerato
 * ad ogni chiamata (non serve gestione logout).
 */
router.get('/token', (_req: Request, res: Response) => {
  const token = jwt.sign(
    { sub: 0, username: 'monitor', ruolo: 'MONITOR', aree: [] },
    config.jwt.secret,
    { expiresIn: '24h' }
  );
  res.json({ token });
});

/**
 * GET /api/monitor/stato
 * Pubblico (nessuna autenticazione richiesta)
 * Response: {
 *   ultimiChiamati: [{ ticket, postazione, servizio, timestamp }],
 *   code: [{ servizioId, nomeServizio, areaId, nomeArea, count }]
 * }
 */
router.get('/stato', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Filtra solo le chiamate di oggi — coerente con INITIAL_STATE via WS
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const domani = new Date(oggi);
    domani.setDate(domani.getDate() + 1);

    // Ultimi 10 numeri chiamati oggi
    const ultimiChiamati = await prisma.chiamata.findMany({
      where: { timestamp: { gte: oggi, lt: domani } },
      orderBy: { timestamp: 'desc' },
      take: 10,
      include: {
        servizio: { select: { nome: true } },
        ticket: { select: { numero: true } },
      },
    });

    // Lunghezza corrente di ogni coda (solo ticket ATTESA di oggi)
    const code = await prisma.ticket.groupBy({
      by: ['servizioId'],
      where: { stato: 'ATTESA', emessoPer: { gte: oggi, lt: domani } },
      _count: { _all: true },
    });

    // Arricchisci i dati della coda con nome servizio e area
    const serviziIds = code.map((c) => c.servizioId);
    const servizi = await prisma.servizio.findMany({
      where: { id: { in: serviziIds } },
      include: { area: { select: { id: true, nome: true } } },
    });
    const serviziMap = new Map(servizi.map((s) => [s.id, s]));

    const codeConDettagli = code.map((c) => {
      const s = serviziMap.get(c.servizioId);
      return {
        servizioId: c.servizioId,
        nomeServizio: s?.nome ?? '',
        areaId: s?.areaId ?? null,
        nomeArea: s?.area?.nome ?? '',
        count: c._count._all,
      };
    });

    res.json({
      ultimiChiamati: ultimiChiamati.map((ch) => ({
        id: ch.id,
        ticket: ch.ticket?.numero ?? `#${ch.id}`,
        postazione: ch.postazione,
        servizio: ch.servizio.nome,
        timestamp: ch.timestamp.toISOString(),
      })),
      code: codeConDettagli,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/monitor/aree
 * Pubblico
 * Lista delle aree attive con i loro servizi (per il monitor display)
 */
router.get('/aree', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const aree = await prisma.area.findMany({
      where: { attiva: true },
      include: {
        servizi: {
          where: { attivo: true },
          select: { id: true, nome: true, lettera: true },
        },
      },
      orderBy: { nome: 'asc' },
    });
    res.json(aree);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/monitor/config
 * Pubblico — restituisce la configurazione del monitor (es. voce abilitata)
 */
router.get('/config', (_req: Request, res: Response) => {
  res.json(readConfig());
});

/**
 * PATCH /api/monitor/config
 * Solo SUPERADMIN — aggiorna la configurazione del monitor
 * Body: { voiceEnabled?: boolean }
 */
router.patch('/config', authenticate, authorize('SUPERADMIN'), (req: Request, res: Response) => {
  const current = readConfig();
  const { voiceEnabled } = req.body as { voiceEnabled?: boolean };
  if (voiceEnabled !== undefined) current.voiceEnabled = Boolean(voiceEnabled);
  writeConfig(current);
  res.json(current);
});

/**
 * GET /api/monitor/tts?testo=Numero+1+2+3+servizio+postazione+1
 * Pubblico — genera un WAV con espeak-ng (voce italiana, pitch femminile)
 * e lo serve come audio/wav.
 * Parametri opzionali: ?pitch=70&speed=130
 */
router.get('/tts', async (req: Request, res: Response) => {
  const testo = String(req.query['testo'] ?? '').trim().slice(0, 300);
  if (!testo) { res.status(400).json({ error: 'Parametro testo obbligatorio.' }); return; }

  const pitch = Math.min(100, Math.max(0, Number(req.query['pitch'] ?? 70)));
  const speed = Math.min(300, Math.max(50, Number(req.query['speed'] ?? 130)));

  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

  try {
    // Prova prima pico2wave (voce italiana femminile naturale, stessa di Android TTS)
    // Fallback su espeak-ng se pico2wave non è disponibile
    try {
      await execFileAsync('pico2wave', [
        '-l', 'it-IT',
        '-w', tmpFile,
        testo,
      ], { timeout: 5000 });
    } catch {
      // pico2wave non disponibile — usa espeak-ng con pitch femminile
      await execFileAsync('espeak-ng', [
        '-v', 'it',
        '-p', String(pitch),
        '-s', String(speed),
        '-w', tmpFile,
        testo,
      ], { timeout: 5000 });
    }

    const wav = fs.readFileSync(tmpFile);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1h — stesso testo = stesso audio
    res.send(wav);
  } catch (err) {
    res.status(500).json({ error: 'Errore generazione audio TTS.' });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignora */ }
  }
});

export default router;