import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../middleware/auth.js';
// import { prisma } from '../prisma/client.js';

export interface LoginResult {
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
 * Autentica un utente e restituisce il token JWT.
 * Lancia un errore se le credenziali non sono valide.
 */
export async function login(username: string, password: string): Promise<LoginResult | null> {
  // TODO: implementare con Prisma
  // const utente = await prisma.utente.findUnique({
  //   where: { username },
  //   include: { ruolo: true, utentiAree: true },
  // });
  //
  // if (!utente || utente.stato === 'DISABILITATO') return null;
  //
  // const match = await bcrypt.compare(password, utente.passwordHash);
  // if (!match) return null;
  //
  // const aree = utente.utentiAree.map((ua) => ua.areaId);
  // const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
  //   sub: utente.id,
  //   username: utente.username,
  //   ruolo: utente.ruolo.nome,
  //   aree,
  // };
  //
  // const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  // return { token, user: { id: utente.id, username: utente.username, ruolo: utente.ruolo.nome, aree, mustChangePwd: utente.mustChangePwd } };

  throw new Error('authService.login not implemented');
}

/**
 * Genera uno username univoco nel formato: prima_lettera_nome + cognome (minuscolo).
 * In caso di collisione aggiunge suffisso numerico da 2 a 999.
 */
export function generateUsername(nome: string, cognome: string): string {
  const base = (nome.charAt(0) + cognome).toLowerCase().replace(/[^a-z0-9]/g, '');
  return base;
}

/**
 * Valida che la password rispetti la policy:
 * - lunghezza 10-64
 * - almeno 1 maiuscola
 * - almeno 1 carattere speciale
 */
export function validatePassword(password: string): boolean {
  if (password.length < 10 || password.length > 64) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[!@#$%^&*()\\_+\-=\[\]{}|;:,.<>?]/.test(password)) return false;
  return true;
}

/**
 * Genera una password temporanea casuale conforme alla policy.
 */
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

  // Mischia
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Hash una password con bcrypt usando il cost factor configurato.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcrypt.costFactor);
}
