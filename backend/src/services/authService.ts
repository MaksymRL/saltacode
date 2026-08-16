import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../middleware/auth.js';
import { prisma } from '../prisma/client.js';

export interface LoginResult {
  /** Token temporaneo firmato con ruolo='__PENDING__'.
   *  Il client lo usa solo per chiamare POST /api/auth/select-role.
   *  NON è valido per le route normali. */
  pendingToken: string;
  user: {
    id: number;
    username: string;
    cognome: string;
    nome: string;
    ruoli: string[];          // tutti i ruoli disponibili per l'utente
    aree: number[];
    mustChangePwd: boolean;
  };
}

export interface SessionResult {
  /** Token JWT definitivo con il ruolo scelto — valido per le route normali. */
  token: string;
  user: {
    id: number;
    username: string;
    ruolo: string;
    aree: number[];
    mustChangePwd: boolean;
  };
}

/**
 * Fase 1 del login: verifica credenziali, restituisce un pending token
 * con la lista dei ruoli disponibili. Se l'utente ha un solo ruolo,
 * il client può saltare la selezione e chiamare direttamente select-role.
 */
export async function login(username: string, password: string): Promise<LoginResult | null> {
  const utente = await prisma.utente.findUnique({
    where: { username },
    include: {
      utentiRuoli: { include: { ruolo: true } },
      utentiAree: true,
    },
  });

  if (!utente || utente.stato === 'DISABILITATO') return null;

  const match = await bcrypt.compare(password, utente.passwordHash);
  if (!match) return null;

  if (utente.utentiRuoli.length === 0) return null; // utente senza ruoli

  const ruoli = utente.utentiRuoli.map((ur) => ur.ruolo.nome);
  const aree = utente.utentiAree.map((ua) => ua.areaId);

  // Token temporaneo — non usabile per le route normali (ruolo='__PENDING__')
  const pendingToken = jwt.sign(
    { sub: utente.id, username: utente.username, ruolo: '__PENDING__', aree, ruoli },
    config.jwt.secret,
    { expiresIn: '5m' } // scade in 5 minuti — solo per la selezione
  );

  return {
    pendingToken,
    user: {
      id: utente.id,
      username: utente.username,
      cognome: utente.cognome,
      nome: utente.nome,
      ruoli,
      aree,
      mustChangePwd: utente.mustChangePwd,
    },
  };
}

/**
 * Fase 2 del login: riceve il pending token e il ruolo scelto,
 * verifica che l'utente abbia quel ruolo, emette il JWT definitivo.
 */
export async function selectRole(pendingToken: string, ruoloScelto: string): Promise<SessionResult | null> {
  let decoded: JwtPayload & { ruoli?: string[] };
  try {
    decoded = jwt.verify(pendingToken, config.jwt.secret) as unknown as JwtPayload & { ruoli?: string[] };
  } catch {
    return null;
  }

  if (decoded.ruolo !== '__PENDING__') return null; // non è un pending token

  const ruoliDisponibili = decoded.ruoli ?? [];
  if (!ruoliDisponibili.includes(ruoloScelto)) return null;

  // Ricarica l'utente per avere lo stato aggiornato
  const utente = await prisma.utente.findUnique({
    where: { id: decoded.sub },
    include: {
      utentiAree: true,
      utentiRuoli: { include: { ruolo: true } },
    },
  });

  if (!utente || utente.stato === 'DISABILITATO') return null;

  const aree = utente.utentiAree.map((ua) => ua.areaId);

  const token = jwt.sign(
    { sub: utente.id, username: utente.username, ruolo: ruoloScelto, aree },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  return {
    token,
    user: {
      id: utente.id,
      username: utente.username,
      ruolo: ruoloScelto,
      aree,
      mustChangePwd: utente.mustChangePwd,
    },
  };
}

/**
 * Genera uno username base: prima_lettera_nome + cognome (minuscolo, solo alfanumerico).
 * Esempio: nome="Mario", cognome="Rossi" → "mrossi"
 */
export function generateUsername(nome: string, cognome: string): string {
  return (nome.charAt(0) + cognome).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Valida la policy della password:
 * - 10–64 caratteri
 * - almeno 1 maiuscola
 * - almeno 1 carattere speciale
 */
export function validatePassword(password: string): boolean {
  if (password.length < 10 || password.length > 64) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[!@#$%^&*()\\_+\-=\[\]{}|;:,.<>?]/.test(password)) return false;
  return true;
}

/** Genera una password temporanea casuale conforme alla policy. */
export function generateTempPassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const specials = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = uppercase + specials + lowercase + digits;

  let pwd = '';
  pwd += uppercase[Math.floor(Math.random() * uppercase.length)];
  pwd += specials[Math.floor(Math.random() * specials.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  for (let i = pwd.length; i < 12; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/** Hash bcrypt con il cost factor configurato. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcrypt.costFactor);
}
